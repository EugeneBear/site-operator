const fs = require('fs');
const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http'); // Для создания HTTP-сервера
const { Server } = require('socket.io'); // Для подключения Socket.IO

const app = express();
const server = http.createServer(app); // Создаем сервер на основе Express
const io = new Server(server); // Подключаем Socket.IO к серверу

app.use(bodyParser.json());

// Путь к вашему JSON с ключами сервисного аккаунта
const SERVICE_ACCOUNT_FILE = './client_secret.json'; // Замените на ваш файл

// ID таблицы Google Sheets
const SPREADSHEET_ID = '1w5X3iEKSq-3_WW6JLbmf9ExShxrp5sLbypsjOJ-mTbE'; // Укажите ID вашей таблицы

// Подключение к Google Sheets API
const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Настройка отдачи статических файлов из текущей директории
app.use(express.static(__dirname));

// Обработчик для главной страницы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Чтобы отслеживать текущий номер клиента
let currentClient = 1; // Начинаем с клиента номер 1

// Обработчик для вызова следующего клиента
app.post('/call-client', async (req, res) => {
  try {
    const rowNumber = currentClient;

    // Записываем время вызова в столбец G
    const currentTime = new Date().toISOString();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `G${rowNumber}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[currentTime]],
      },
    });

    currentClient++;

    // Уведомляем всех подключенных клиентов о новом вызове
    io.emit('clientCalled', { clientNumber: rowNumber });

    res.status(200).send({ message: 'Client called successfully', clientNumber: rowNumber });
  } catch (error) {
    console.error('Error calling client:', error);
    res.status(500).send('Failed to call client.');
  }
});

// Обработчик для завершения обслуживания
app.post('/end-service', async (req, res) => {
  try {
    const rowNumber = currentClient - 1;
    const endTime = new Date().toISOString();

    // Записываем время завершения в столбец H
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `H${rowNumber}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[endTime]],
      },
    });

    io.emit('serviceEnded', { clientNumber: rowNumber });

    res.status(200).send('Service ended successfully.');
  } catch (error) {
    console.error('Error ending service:', error);
    res.status(500).send('Failed to end service.');
  }
});

// Подключение новых клиентов через WebSocket
io.on('connection', (socket) => {
  console.log('Новое соединение установлено');

  socket.on('disconnect', () => {
    console.log('Пользователь отключился');
  });
});

// Прослушивание порта
server.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});
