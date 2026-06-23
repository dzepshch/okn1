from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY, FLASK_SECRET_KEY, FLASK_ENV
import math
import os

# Сбрасываем прокси (VPN фикс)
#os.environ.pop('ALL_PROXY', None)
#os.environ.pop('all_proxy', None)
#os.environ.pop('HTTP_PROXY', None)
#os.environ.pop('HTTPS_PROXY', None)
#os.environ.pop('http_proxy', None)
#os.environ.pop('https_proxy', None)

app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY
CORS(app)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
TABLE = "cultural_objects"


# ─────────────────────────────────────────────
# Фронтенд — Flask раздаёт HTML страницы
# ─────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search')
def search():
    return render_template('search.html')

@app.route('/routes')
def routes():
    return render_template('routes.html')


# ─────────────────────────────────────────────
# GET /api/objects
# ─────────────────────────────────────────────
@app.route("/api/objects", methods=["GET"])
def get_objects():
    q           = request.args.get("q", "").strip()
    adm_area    = request.args.get("adm_area", "").strip()
    district    = request.args.get("district", "").strip()
    obj_type    = request.args.get("obj_type", "").strip()
    category    = request.args.get("category", "").strip()
    year_built  = request.args.get("year_built", "").strip()
    year_period = request.args.get("year_period", "").strip()

    try:
        page     = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    except ValueError:
        page, per_page = 1, 20

    offset = (page - 1) * per_page
    query = supabase.table(TABLE).select("*", count="exact")

    if q:           query = query.ilike("name", f"%{q}%")
    if adm_area:    query = query.eq("adm_area", adm_area)
    if district:    query = query.eq("district", district)
    if obj_type:    query = query.eq("obj_type", obj_type)
    if category:    query = query.eq("category", category)
    if year_built:  query = query.eq("year_built", year_built)
    if year_period: query = query.eq("year_period", year_period)

    query = query.order("name").range(offset, offset + per_page - 1)
    response = query.execute()

    total = response.count or 0
    total_pages = math.ceil(total / per_page) if total else 1

    return jsonify({
        "objects": response.data,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages,
        }
    })


# ─────────────────────────────────────────────
# GET /api/objects/<id>
# ─────────────────────────────────────────────
@app.route("/api/objects/<int:obj_id>", methods=["GET"])
def get_object(obj_id):
    response = supabase.table(TABLE).select("*").eq("id", obj_id).single().execute()
    if not response.data:
        return jsonify({"error": "Объект не найден"}), 404
    return jsonify(response.data)


# ─────────────────────────────────────────────
# GET /api/stats
# ─────────────────────────────────────────────
@app.route("/api/stats", methods=["GET"])
def get_stats():
    response = supabase.table(TABLE).select("adm_area, obj_type").execute()
    data = response.data or []

    by_area = {}
    by_type = {}
    for obj in data:
        area  = obj.get("adm_area", "")
        otype = obj.get("obj_type", "")
        if area:  by_area[area]  = by_area.get(area, 0) + 1
        if otype: by_type[otype] = by_type.get(otype, 0) + 1

    return jsonify({"total": len(data), "by_area": by_area, "by_type": by_type})


# ─────────────────────────────────────────────
# GET /api/filters
# ─────────────────────────────────────────────
@app.route("/api/filters", methods=["GET"])
def get_filters():
    response = supabase.table(TABLE).select("adm_area, district, obj_type, category").execute()
    data = response.data or []

    return jsonify({
        "adm_areas":  sorted(set(o["adm_area"] for o in data if o.get("adm_area"))),
        "districts":  sorted(set(o["district"]  for o in data if o.get("district"))),
        "obj_types":  sorted(set(o["obj_type"]  for o in data if o.get("obj_type"))),
        "categories": sorted(set(o["category"]  for o in data if o.get("category"))),
    })


# ─────────────────────────────────────────────
# POST /api/route
# ─────────────────────────────────────────────
@app.route("/api/route", methods=["POST"])
def build_route():
    body = request.get_json()
    if not body or "ids" not in body:
        return jsonify({"error": "Передайте список ids"}), 400

    ids = body["ids"]
    if len(ids) < 2:
        return jsonify({"error": "Нужно минимум 2 объекта"}), 400
    if len(ids) > 20:
        return jsonify({"error": "Максимум 20 объектов в маршруте"}), 400

    response = supabase.table(TABLE).select("id, name, adm_area, address, lat, lng").in_("id", ids).execute()
    objects = response.data or []

    if len(objects) < 2:
        return jsonify({"error": "Объекты не найдены"}), 404

    def haversine(lat1, lon1, lat2, lon2):
        R = 6371
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
        return R * 2 * math.asin(math.sqrt(a))

    unvisited = list(objects)
    route = [unvisited.pop(0)]
    while unvisited:
        last = route[-1]
        nearest = min(unvisited, key=lambda o: haversine(last["lat"], last["lng"], o["lat"], o["lng"]))
        route.append(nearest)
        unvisited.remove(nearest)

    total_distance_km = sum(
        haversine(route[i]["lat"], route[i]["lng"], route[i+1]["lat"], route[i+1]["lng"])
        for i in range(len(route) - 1)
    )

    walk_time_min  = round((total_distance_km / 5) * 60)
    visit_time_min = len(route) * 30
    total_time_min = walk_time_min + visit_time_min
    hours, mins    = divmod(total_time_min, 60)
    duration_str   = f"{hours} ч {mins} мин" if hours else f"{mins} мин"

    return jsonify({
        "route": route,
        "stats": {
            "distance_km":    round(total_distance_km, 2),
            "walk_time_min":  walk_time_min,
            "visit_time_min": visit_time_min,
            "total_time_min": total_time_min,
            "duration":       duration_str,
            "objects_count":  len(route),
        }
    })


# ─────────────────────────────────────────────
# GET /api/health
# ─────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    debug = FLASK_ENV == "development"
    app.run(host="0.0.0.0", debug=debug, port=5000)