gemini-chatbot/
├── package.json          # Daftar dependensi & script npm
├── .env.example           # Contoh format file .env (isi API key di sini)
├── .env                    # (dibuat sendiri saat setup — tidak ikut ter-zip)
├── server.js              # Backend Express — endpoint /api/chat, koneksi ke Gemini API
│
└── public/                # Semua file yang dilayani ke browser (frontend)
    ├── index.html          # Struktur/kerangka halaman chat
    ├── style.css           # Styling tampilan (tema gelap modern)
    └── script.js           # Logika interaktif frontend (kirim pesan, upload file, dll)

unzip gemini-chatbot.zip && cd gemini-chatbot
npm install
cp .env.example .env
# edit file .env, isi dengan API key kamu:
# GEMINI_API_KEY=...
npm start
