const { google } = require('googleapis');
const fs = require('fs');
const { Readable } = require('stream');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/drive.file']
});
const drive = google.drive({ version: 'v3', auth });

async function uploadFile(name, mimeType, bodyStream) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
    },
    media: { mimeType, body: bodyStream }
  });
  return res.data.id;
}

function bufferToStream(buffer) {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
}

module.exports = { uploadFile, bufferToStream };
