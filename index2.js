require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const chokidar = require('chokidar');

const api=process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(api);
const app = express();
const PORT = 5000;

const WATCH_DIRECTORY = "./incoming_files";
const BASE_FOLDER = "./organized_files"; // Base folder for dynamically created folders

let log_data = [];
const processingFiles = new Set(); // Track files being processed

function logMessage(message) {
    log_data.push(message);
    if (log_data.length > 100) log_data.shift();
    console.log(message);
}

async function askGemini(filename) {
    return new Promise((resolve) => {
        setTimeout(async () => {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const prompt = `Suggest a single folder name to organize the file named '${filename}'. Return only the folder name as output.`;
                const result = await model.generateContent(prompt);
                const folder = result.response.text().toLowerCase().trim();
                resolve(folder);
            } catch (error) {
                logMessage(`Error querying Gemini: ${error}`);
                resolve("uncategorized"); // Default folder if Gemini fails
            }
        }, 1000); // 1-second delay between API calls
    });
}

function moveFile(filePath) {
    if (processingFiles.has(filePath)) return; // Skip if already processing
    processingFiles.add(filePath);

    const filename = path.basename(filePath);
    logMessage(`New file detected: ${filename}`);

    // Check if the file still exists
    if (!fs.existsSync(filePath)) {
        processingFiles.delete(filePath);
        logMessage(`File no longer exists: ${filename}`);
        return;
    }

    askGemini(filename).then(folder => {
        const destFolder = path.join(BASE_FOLDER, folder); // Create folder path
        const destPath = path.join(destFolder, filename);

        fs.mkdirSync(destFolder, { recursive: true }); // Ensure destination folder exists
        fs.rename(filePath, destPath, (err) => {
            processingFiles.delete(filePath); // Remove from processing set
            if (err) {
                logMessage(`Error moving file: ${err}`);
            } else {
                logMessage(`Moved '${filename}' to ${folder}`);
            }
        });
    }).catch(error => {
        processingFiles.delete(filePath); // Remove from processing set on error
        logMessage(`Error processing file: ${error}`);
    });
}

function traverseDirectory(dir) {
    fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            traverseDirectory(filePath); // Recursively traverse subdirectories
        } else if (stat.isFile()) {
            moveFile(filePath); // Process files
        }
    });
}

app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, './templates/index.html'));
});
app.get('/logs', (req, res) => {
    res.json(log_data);
});

function startMonitoring() {
    chokidar.watch(WATCH_DIRECTORY, { persistent: true, ignoreInitial: false }).on('all', (event, filePath) => {
        if (event === 'add' || event === 'addDir') {
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                traverseDirectory(filePath); // Handle directories
            } else if (stat.isFile()) {
                moveFile(filePath); // Handle files
            }
        }
    });
}

app.listen(PORT, () => {
    fs.mkdirSync(BASE_FOLDER, { recursive: true }); // Create base folder
    fs.mkdirSync(WATCH_DIRECTORY, { recursive: true }); // Create watch directory

    logMessage(`Server running on http://localhost:${PORT}`);
    startMonitoring();
});