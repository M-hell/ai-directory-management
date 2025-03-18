import os
import shutil
import time
import json
from google import genai
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from flask import Flask, render_template, jsonify

# Replace with your Gemini API key
GEMINI_API_KEY = ""
client = genai.Client(api_key=GEMINI_API_KEY)

# Paths
WATCH_DIRECTORY = "./incoming_files"
FOLDERS = {"important": "./important", "entertainment": "./entertainment", "research": "./research"}

# Flask app for UI logging
app = Flask(__name__)
log_data = []

def log_message(message):
    log_data.append(message)
    if len(log_data) > 100:
        log_data.pop(0)  # Keep logs limited to last 100 entries
    print(message)

def ask_gemini(filename):
    """Ask Gemini API where to place the file"""
    response = client.models.generate_content(model="gemini-2.0-flash", contents=f"Classify the file named '{filename}' into 'important', 'entertainment', or 'research'. Return only one of these words as output.")
    folder = response.text.strip().lower()
    if folder in FOLDERS:
        return folder
    log_message(f"Invalid response from Gemini: {folder}, defaulting to 'important'")
    return "important"

class FileHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        filename = os.path.basename(event.src_path)
        log_message(f"New file detected: {filename}")
        folder = ask_gemini(filename)
        
        dest_folder = FOLDERS.get(folder, "./important")
        dest_path = os.path.join(dest_folder, filename)
        shutil.move(event.src_path, dest_path)
        log_message(f"Moved '{filename}' to {folder}")

@app.route('/')
def index():
    return render_template("index.html", logs=log_data)

@app.route('/logs')
def get_logs():
    return jsonify(log_data)

def start_monitoring():
    event_handler = FileHandler()
    observer = Observer()
    observer.schedule(event_handler, WATCH_DIRECTORY, recursive=False)
    observer.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    os.makedirs(WATCH_DIRECTORY, exist_ok=True)
    for folder in FOLDERS.values():
        os.makedirs(folder, exist_ok=True)
    
    from threading import Thread
    Thread(target=start_monitoring, daemon=True).start()
    app.run(debug=True, port=5000)
