const express = require("express");
const axios = require("axios");
const { Storage } = require("@google-cloud/storage");

const app = express();
app.use(express.json());

const storage = new Storage();
const bucketName = process.env.BUCKET_NAME;

/**
 * Health check (VERY IMPORTANT for Cloud Run)
 */
app.get("/", (req, res) => {
  res.send("Service is running");
});

/**
 * Download file from Quickbase date 16-apr
 */
async function downloadFromQuickbase(fileUrl) {
  const response = await axios({
    method: "GET",
    url: fileUrl,
    responseType: "stream",
    headers: {
      "QB-Realm-Hostname": process.env.QB_REALM?.replace("https://", ""),
      "Authorization": `QB-USER-TOKEN ${process.env.QB_USER_TOKEN}`
    }
  });

  return response.data;
}

/**
 * Upload to GCS
 */
async function uploadToGCS(fileStream, destinationFileName) {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(destinationFileName);

  return new Promise((resolve, reject) => {
    const writeStream = file.createWriteStream({
      resumable: false,
      contentType: "text/csv"
    });

    fileStream
      .pipe(writeStream)
      .on("finish", () => resolve(`gs://${bucketName}/${destinationFileName}`))
      .on("error", reject);
  });
}

/**
 * Main API
 */
app.post("/upload", async (req, res) => {
  try {
    const { fileUrl, fileName } = req.body;

    if (!fileUrl) {
      return res.status(400).json({ error: "fileUrl is required" });
    }

    const qbStream = await downloadFromQuickbase(fileUrl);
    const destination = fileName || `qb-upload-${Date.now()}.csv`;

    const gcsPath = await uploadToGCS(qbStream, destination);

    res.json({
      message: "Upload successful",
      gcsPath
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Upload failed",
      details: err.message
    });
  }
});

/**
 * Start server (Cloud Run requirement)
 */
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
