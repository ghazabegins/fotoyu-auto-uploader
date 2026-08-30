const axios = require('axios');
const fs = require('fs');

const configPath = 'C:\\Users\\IMBA PC\\AppData\\Roaming\\fotoyu-uploader-desktop\\config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const token = config.authToken;

const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
const headers = {
  'Authorization': authHeader,
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://www.fotoyu.com',
  'Referer': 'https://www.fotoyu.com/'
};

async function testVideoPayloadFields() {
  console.log('=== TESTING VIDEO FIELDS IN CREATIONS LINK ===');

  const payloads = [
    {
      name: 'contents with video object',
      payload: {
        contents: [
          {
            height: 1080,
            width: 1920,
            size: 100000,
            extension: 'jpeg',
            file: {},
            signature: `sig_${Date.now()}_1`,
            video: {
              extension: 'mp4',
              size: 500000,
              signature: `vid_sig_${Date.now()}_1`
            }
          }
        ]
      }
    },
    {
      name: 'contents with video_signature & video_extension',
      payload: {
        contents: [
          {
            height: 1080,
            width: 1920,
            size: 100000,
            extension: 'jpeg',
            file: {},
            signature: `sig_${Date.now()}_2`,
            video_extension: 'mp4',
            video_size: 500000,
            video_signature: `vid_sig_${Date.now()}_2`
          }
        ]
      }
    },
    {
      name: 'separate videos array',
      payload: {
        contents: [
          {
            height: 1080,
            width: 1920,
            size: 100000,
            extension: 'jpeg',
            file: {},
            signature: `sig_${Date.now()}_3`
          }
        ],
        videos: [
          {
            extension: 'mp4',
            size: 500000,
            signature: `vid_sig_${Date.now()}_3`
          }
        ]
      }
    }
  ];

  for (const item of payloads) {
    console.log(`\n--- Testing ${item.name} ---`);
    try {
      const res = await axios.post('https://api.fotoyu.com/gs/v3/creations/link', item.payload, { headers });
      console.log('STATUS:', res.status);
      console.log('RESPONSE:', JSON.stringify(res.data, null, 2));
    } catch (err) {
      if (err.response) {
        console.log('ERROR STATUS:', err.response.status, err.response.data);
      } else {
        console.log('ERROR:', err.message);
      }
    }
  }
}

testVideoPayloadFields();
