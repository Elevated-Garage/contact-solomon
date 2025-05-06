const { google } = require('googleapis');
const { Readable } = require('stream');

async function uploadToDrive({ fileName, mimeType, buffer, folderId }) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GDRIVE_CLIENT_EMAIL,
      private_key: process.env.GDRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  const fileMetadata = {
    name: fileName,
    parents: folderId ? [folderId] : [],
  };

  const media = {
    mimeType,
    body: Readable.from(buffer),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id',
  });

  console.log(`📁 Uploaded file to Google Drive (ID: ${response.data.id})`);
  return response.data.id;
}

module.exports = { uploadToDrive };
