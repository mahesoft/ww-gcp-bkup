const express = require("express");
const axios = require("axios");
const { Storage } = require("@google-cloud/storage");
require("dotenv").config();

const app = express();
app.use(express.json());

const storage = new Storage();
const bucketName = process.env.BUCKET_NAME;

/**
 * Download file from Quickbase file field
 */
async function downloadFromQuickbase(fileUrl) {
  const response = await axios({
    method: "GET",
    url: fileUrl,
    responseType: "stream",
    headers: {
      "QB-Realm-Hostname": process.env.QB_REALM.replace("https://", ""),
      "Authorization": `QB-USER-TOKEN ${process.env.QB_USER_TOKEN}`
    }
  });

  return response.data; // stream
}

/**
 * Upload stream to GCS
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
 * MAIN API
 * Expects Quickbase file URL
 */
app.post("/upload-qb-file", async (req, res) => {
  try {
    const { fileUrl, fileName } = req.body;

    if (!fileUrl) {
      return res.status(400).json({ error: "fileUrl is required" });
    }

    console.log("Downloading from Quickbase...");

    const qbStream = await downloadFromQuickbase(fileUrl);

    const destination = fileName || `qb-upload-${Date.now()}.csv`;

    console.log("Uploading to GCS...");

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

app.listen(process.env.PORT || 8080, () => {
  console.log("Server running...");
});
