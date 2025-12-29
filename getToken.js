const { initializeApp } = require("firebase/app");
const {
  getAuth,
  signInWithEmailAndPassword,
  connectAuthEmulator,
} = require("firebase/auth");

// Config minimal (tidak perlu apiKey asli untuk emulator)
const firebaseConfig = {
  apiKey: "fake-api-key",
  authDomain: "localhost",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ✅ CARA BENAR DI SDK v9+
connectAuthEmulator(auth, "http://localhost:9099");

async function login() {
  const email = "dummy@example.com";
  const password = "testing12";

  const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  const token = await userCredential.user.getIdToken();
  console.log("\nID TOKEN:\n", token);
}

login().catch(console.error);
