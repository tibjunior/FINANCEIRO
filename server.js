
const express = require('express');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// TODO: Replace with your service account credentials
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

const app = express();
app.use(express.json());

app.post('/api/login', async (req, res) => {
  const { idToken } = req.body;
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    // Create a session cookie
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });
    const options = { maxAge: expiresIn, httpOnly: true, secure: true };
    res.cookie('session', sessionCookie, options);
    res.end(JSON.stringify({ status: 'success' }));
  } catch (error) {
    res.status(401).send('UNAUTHORIZED REQUEST!');
  }
});

app.post('/api/rpc', async (req, res) => {
    const { call, args } = req.body;

    try {
        const sessionCookie = req.cookies.session || '';
        const decodedClaims = await auth.verifySessionCookie(sessionCookie, true /** checkRevoked */);
        const uid = decodedClaims.uid;

        // TODO: Add a validation layer to ensure the user is authorized to perform the requested action

        const [collection, method] = call.split('.');
        const result = await db.collection(collection)[method](...args);
        res.json(result);
    } catch (error) {
        res.status(401).send('UNAUTHORIZED REQUEST!');
    }
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
