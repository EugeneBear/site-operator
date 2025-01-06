const fs = require('fs');
const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(bodyParser.json());

// ID таблицы Google Sheets
const SPREADSHEET_ID = '1w5X3iEKSq-3_WW6JLbmf9ExShxrp5sLbypsjOJ-mTbE';

// Подключение к Google Sheets API
const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
if (!credentialsJson) {
  throw new Error('Переменная окружения GOOGLE_APPLICATION_CREDENTIALS_JSON не установлена');
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(credentialsJson),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

app.use(express.static(__dirname));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// Получение текущего номера клиента из ячейки F2
async function getCurrentClient() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'F2', // Изменено на F2
  });
  return parseInt(response.data.values?.[0]?.[0] || '1', 10);
}

// Сохранение текущего номера клиента в ячейку F2
async function saveCurrentClient(clientNumber) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'F2', // Изменено на F2
    valueInputOption: 'RAW',
    resource: {
      values: [[clientNumber]],
    },
  });
}

// Обработчик для вызова клиента
app.post('/call-client', async (req, res) => {
  try {
    const currentClient = await getCurrentClient();
    const currentTime = new Date().toISOString();

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `G${currentClient + 1}`, // Запись во вторую строку и ниже
      valueInputOption: 'RAW',
      resource: {
        values: [[currentTime]],
      },
    });

    const nextClient = currentClient + 1;
    await saveCurrentClient(nextClient);

    io.emit('clientCalled', { clientNumber: currentClient });

    res.status(200).send({ message: 'Client called successfully', clientNumber: currentClient });
  } catch (error) {
    console.error('Error calling client:', error);
    res.status(500).send('Failed to call client.');
  }
});

// Обработчик для завершения обслуживания
app.post('/end-service', async (req, res) => {
  try {
    const currentClient = (await getCurrentClient()) - 1;
    const endTime = new Date().toISOString();

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `H${currentClient + 1}`, // Запись во вторую строку и ниже
      valueInputOption: 'RAW',
      resource: {
        values: [[endTime]],
      },
    });

    io.emit('serviceEnded', { clientNumber: currentClient });

    res.status(200).send('Service ended successfully.');
  } catch (error) {
    console.error('Error ending service:', error);
    res.status(500).send('Failed to end service.');
  }
});

// WebSocket
io.on('connection', async (socket) => {
  console.log('Новое соединение установлено');

  // Отправляем текущий номер клиенту сразу после подключения
  const currentClient = await getCurrentClient();
  socket.emit('updateClientNumber', { clientNumber: currentClient });

  socket.on('disconnect', () => {
    console.log('Пользователь отключился');
  });
});

// Запуск сервера
server.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});
