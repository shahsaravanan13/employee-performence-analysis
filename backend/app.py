import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from sqlalchemy import create_engine, Column, Integer, String, Float, Date
from sqlalchemy.orm import sessionmaker, declarative_base
import pandas as pd

Base = declarative_base()

class Employee(Base):
    __tablename__ = 'employees'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String)
    department = Column(String)
    role = Column(String)
    location = Column(String)
    performance_score = Column(Float)
    projects_completed = Column(Integer)
    sales = Column(Float)
    customer_satisfaction = Column(Float)
    review_date = Column(Date)

def create_app():
    app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), '..', 'frontend'), static_url_path='')
    CORS(app)
    db_path = os.path.join(os.path.dirname(__file__), 'employees.db')
    engine = create_engine(f'sqlite:///{db_path}', future=True)
    SessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(engine)

    def ensure_columns():
        with engine.begin() as conn:
            cols = conn.exec_driver_sql('PRAGMA table_info(employees)').fetchall()
            existing = {c[1] for c in cols}
            to_add = []
            if 'role' not in existing:
                to_add.append('ALTER TABLE employees ADD COLUMN role TEXT')
            if 'location' not in existing:
                to_add.append('ALTER TABLE employees ADD COLUMN location TEXT')
            for stmt in to_add:
                conn.exec_driver_sql(stmt)
    ensure_columns()

    @app.route('/')
    def landing():
        return send_from_directory(app.static_folder, 'landing.html')

    @app.route('/view-project')
    def view_project():
        return send_from_directory(app.static_folder, 'index.html')

    @app.route('/api/meta', methods=['GET'])
    def meta():
        numeric_columns = ['performance_score', 'projects_completed', 'sales', 'customer_satisfaction']
        group_columns = ['department', 'role', 'location']
        return jsonify({'numeric_columns': numeric_columns, 'group_columns': group_columns})

    @app.route('/api/employees', methods=['GET'])
    def list_employees():
        s = SessionLocal()
        q = s.query(Employee).limit(500).all()
        data = []
        for e in q:
            data.append({
                'id': e.id,
                'name': e.name,
                'department': e.department,
                'role': e.role,
                'location': e.location,
                'performance_score': e.performance_score,
                'projects_completed': e.projects_completed,
                'sales': e.sales,
                'customer_satisfaction': e.customer_satisfaction,
                'review_date': e.review_date.isoformat() if e.review_date else None
            })
        s.close()
        return jsonify({'employees': data})

    @app.route('/api/upload', methods=['POST'])
    def upload_csv():
        if 'file' not in request.files:
            return jsonify({'error': 'file missing'}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'empty filename'}), 400
        try:
            df = pd.read_csv(file, on_bad_lines='skip')
        except UnicodeDecodeError:
            try:
                file.stream.seek(0)
                df = pd.read_csv(file, on_bad_lines='skip', encoding='latin1')
            except Exception as e:
                return jsonify({'error': f'csv read failed: {str(e)}'}), 400
        except Exception as e:
            return jsonify({'error': f'csv read failed: {str(e)}'}), 400
        df.columns = [c.strip() for c in df.columns]
        def safe_str(v):
            if v is None:
                return None
            if isinstance(v, float) and pd.isna(v):
                return None
            s = str(v).strip()
            return s if s != '' else None
        def safe_float(v):
            try:
                if v is None or (isinstance(v, float) and pd.isna(v)):
                    return None
                s = str(v).replace(',', '').strip()
                if s == '':
                    return None
                return float(s)
            except Exception:
                return None
        def safe_int(v):
            try:
                if v is None or (isinstance(v, float) and pd.isna(v)):
                    return None
                s = str(v).replace(',', '').strip()
                if s == '':
                    return None
                return int(float(s))
            except Exception:
                return None
        s = SessionLocal()
        for _, row in df.iterrows():
            e = Employee()
            e.name = safe_str(row.get('name'))
            e.department = safe_str(row.get('department'))
            e.role = safe_str(row.get('role'))
            e.location = safe_str(row.get('location'))
            e.performance_score = safe_float(row.get('performance_score'))
            e.projects_completed = safe_int(row.get('projects_completed'))
            e.sales = safe_float(row.get('sales'))
            e.customer_satisfaction = safe_float(row.get('customer_satisfaction'))
            rd = row.get('review_date')
            if not pd.isna(rd):
                try:
                    e.review_date = pd.to_datetime(rd).date()
                except Exception:
                    e.review_date = None
            s.add(e)
        s.commit()
        count = s.query(Employee).count()
        s.close()
        return jsonify({'status': 'ok', 'total_records': count})

    @app.route('/api/boxplot', methods=['GET'])
    def boxplot():
        metric = request.args.get('metric', 'performance_score')
        group_by = request.args.get('group_by', 'department')
        s = SessionLocal()
        q = s.query(Employee).all()
        data = pd.DataFrame([{
            'department': e.department,
            'role': e.role,
            'location': e.location,
            'performance_score': e.performance_score,
            'projects_completed': e.projects_completed,
            'sales': e.sales,
            'customer_satisfaction': e.customer_satisfaction
        } for e in q])
        s.close()
        if metric not in data.columns or group_by not in data.columns:
            return jsonify({'error': 'invalid metric or group_by'}), 400
        data = data.dropna(subset=[metric, group_by])
        groups = []
        values = []
        for g, d in data.groupby(group_by):
            groups.append(str(g))
            values.append(list(d[metric].astype(float)))
        return jsonify({'groups': groups, 'values': values, 'metric': metric, 'group_by': group_by})

    @app.route('/api/correlation', methods=['GET'])
    def correlation():
        s = SessionLocal()
        q = s.query(Employee).all()
        data = pd.DataFrame([{
            'performance_score': e.performance_score,
            'projects_completed': e.projects_completed,
            'sales': e.sales,
            'customer_satisfaction': e.customer_satisfaction
        } for e in q])
        s.close()
        data = data.dropna(how='all')
        if data.empty:
            return jsonify({'labels': [], 'matrix': []})
        corr = data.corr(numeric_only=True)
        labels = list(corr.columns)
        matrix = corr.values.tolist()
        return jsonify({'labels': labels, 'matrix': matrix})

    return app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '5000'))
    app.run(host='0.0.0.0', port=port)