from flask import Flask, request, jsonify, render_template, session, redirect, url_for
import sqlite3
import os

app = Flask(__name__)
app.secret_key = 'gigbridge_secure_key_123'
DB_FILE = "gigbridge.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            budget TEXT NOT NULL,
            location TEXT NOT NULL,
            status TEXT DEFAULT 'open',
            client_username TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            worker_name TEXT NOT NULL,
            message TEXT NOT NULL,
            expected_rate TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES jobs (id)
        )
    ''')
    # Try adding client_username column if it doesn't exist
    try:
        c.execute("ALTER TABLE jobs ADD COLUMN client_username TEXT")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()

init_db()

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/auth')
def auth_view():
    return render_template('auth.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ? AND password = ?', (username, password)).fetchone()
    conn.close()
    if user:
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user['role']
        return jsonify({'status': 'success', 'role': user['role']})
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', (username, password, role))
        conn.commit()
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user['role']
        conn.close()
        return jsonify({'status': 'success', 'role': role})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Username already exists'}), 400

@app.route('/api/logout')
def logout():
    session.clear()
    return jsonify({'status': 'success'})

@app.route('/client')
def client_view():
    if 'user_id' not in session or session.get('role') != 'client':
        return redirect(url_for('auth_view'))
    return render_template('client.html')

@app.route('/worker')
def worker_view():
    if 'user_id' not in session or session.get('role') != 'worker':
        return redirect(url_for('auth_view'))
    return render_template('worker.html')

# API Endpoints
@app.route('/api/auth/me', methods=['GET'])
def get_me():
    if 'user_id' in session:
        return jsonify({'loggedIn': True, 'username': session['username'], 'role': session['role']})
    return jsonify({'loggedIn': False})

@app.route('/api/jobs', methods=['GET', 'POST'])
def handle_jobs():
    conn = get_db_connection()
    if request.method == 'POST':
        if session.get('role') != 'client':
            return jsonify({'error': 'Unauthorized'}), 403
        data = request.json
        c = conn.cursor()
        c.execute('INSERT INTO jobs (title, category, description, budget, location, client_username) VALUES (?, ?, ?, ?, ?, ?)',
                  (data.get('title'), data.get('category'), data.get('description'), data.get('budget'), data.get('location'), session.get('username')))
        conn.commit()
        job_id = c.lastrowid
        conn.close()
        return jsonify({'id': job_id, 'status': 'success'}), 201
    else:
        status = request.args.get('status')
        category = request.args.get('category')
        client_only = request.args.get('client_only') == 'true'
        
        query = 'SELECT j.*, (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as app_count FROM jobs j WHERE 1=1'
        params = []
        if status:
            query += ' AND j.status = ?'
            params.append(status)
        else:
            if not client_only:
                query += " AND j.status = 'open'"
                
        if category and category != 'All':
            query += ' AND j.category = ?'
            params.append(category)
            
        if client_only and session.get('role') == 'client':
            query += ' AND j.client_username = ?'
            params.append(session.get('username'))
            
        query += ' ORDER BY j.created_at DESC'
        
        jobs = conn.execute(query, params).fetchall()
        conn.close()
        return jsonify([dict(ix) for ix in jobs])

@app.route('/api/stats/client', methods=['GET'])
def client_stats():
    if session.get('role') != 'client':
        return jsonify({'error': 'Unauthorized'}), 403
    conn = get_db_connection()
    username = session.get('username')
    total_jobs = conn.execute('SELECT COUNT(*) FROM jobs WHERE client_username = ?', (username,)).fetchone()[0]
    open_jobs = conn.execute("SELECT COUNT(*) FROM jobs WHERE status = 'open' AND client_username = ?", (username,)).fetchone()[0]
    
    total_apps_query = '''
        SELECT COUNT(a.id) FROM applications a
        JOIN jobs j ON a.job_id = j.id
        WHERE j.client_username = ?
    '''
    total_apps = conn.execute(total_apps_query, (username,)).fetchone()[0]
    conn.close()
    return jsonify({
        'total_jobs': total_jobs,
        'open_jobs': open_jobs,
        'total_apps': total_apps
    })

@app.route('/api/applications', methods=['GET', 'POST'])
def handle_applications():
    if request.method == 'POST':
        if session.get('role') != 'worker':
            return jsonify({'error': 'Unauthorized'}), 403
        data = request.json
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('INSERT INTO applications (job_id, worker_name, message, expected_rate) VALUES (?, ?, ?, ?)',
                  (data.get('job_id'), session.get('username'), data.get('message'), data.get('expected_rate')))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success'}), 201
    else:
        if session.get('role') != 'worker':
            return jsonify({'error': 'Unauthorized'}), 403
        worker_name = session.get('username')
        conn = get_db_connection()
        apps = conn.execute('''
            SELECT a.*, j.title as job_title, j.budget as job_budget 
            FROM applications a 
            JOIN jobs j ON a.job_id = j.id 
            WHERE a.worker_name = ? 
            ORDER BY a.created_at DESC
        ''', (worker_name,)).fetchall()
        conn.close()
        return jsonify([dict(ix) for ix in apps])

@app.route('/api/applications/<int:job_id>', methods=['GET'])
def get_job_applications(job_id):
    if session.get('role') != 'client':
        return jsonify({'error': 'Unauthorized'}), 403
    conn = get_db_connection()
    apps = conn.execute('SELECT * FROM applications WHERE job_id = ? ORDER BY created_at DESC', (job_id,)).fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in apps])

@app.route('/api/applications/<int:app_id>/status', methods=['PUT'])
def update_application_status(app_id):
    data = request.json
    new_status = data.get('status')
    if new_status not in ['accepted', 'rejected']:
        return jsonify({'error': 'Invalid status'}), 400
        
    conn = get_db_connection()
    c = conn.cursor()
    
    # Update this application
    c.execute('UPDATE applications SET status = ? WHERE id = ?', (new_status, app_id))
    
    if new_status == 'accepted':
        # Get job_id for this app
        app_record = c.execute('SELECT job_id FROM applications WHERE id = ?', (app_id,)).fetchone()
        if app_record:
            job_id = app_record['job_id']
            # Reject all other pending applications for this job
            c.execute("UPDATE applications SET status = 'rejected' WHERE job_id = ? AND id != ? AND status = 'pending'", (job_id, app_id))
            # Close the job
            c.execute("UPDATE jobs SET status = 'closed' WHERE id = ?", (job_id,))
            
    conn.commit()
    conn.close()
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
