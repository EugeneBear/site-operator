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

// Функция для поиска следующего свободного клиента
async function findNextAvailableClient() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'A2:G300', // Диапазон номеров и времени
  });
  const rows = response.data.values || [];
  
  for (let i = 0; i < rows.length; i++) { // Начинаем с индекса 0 (ячейка A2)
    const clientNumber = rows[i][0]; // Номер в столбце A
    const callTime = rows[i][6]; // Время в столбце G
    
    if (!callTime) {
      return { clientNumber: parseInt(clientNumber, 10), rowIndex: i + 2 }; // Номер клиента и индекс строки
    }
  }
  throw new Error('No available clients found.');
}


// Функция для записи текущего клиента в ячейку F2
async function saveCurrentClientToF2(clientNumber) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'F2',
    valueInputOption: 'RAW',
    resource: {
      values: [[clientNumber]],
    },
  });
}

// Функция для записи времени начала обслуживания
async function callClient(rowIndex) {
  const currentTime = new Date().toISOString();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `G${rowIndex}`,
    valueInputOption: 'RAW',
    resource: {
      values: [[currentTime]],
    },
  });
}

// Функция для записи времени завершения обслуживания
async function endService(rowIndex) {
  const currentTime = new Date().toISOString();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `H${rowIndex}`,
    valueInputOption: 'RAW',
    resource: {
      values: [[currentTime]],
    },
  });
}

// Обработчик для вызова клиента
app.post('/call-client', async (req, res) => {
  try {
    const { clientNumber, rowIndex } = await findNextAvailableClient();

    // Записываем текущего клиента в ячейку F2
    await saveCurrentClientToF2(clientNumber);

    // Фиксируем время начала обслуживания
    await callClient(rowIndex);

    io.emit('clientCalled', { clientNumber });
    res.status(200).send({ message: 'Client called successfully', clientNumber });
  } catch (error) {
    console.error('Error calling client:', error);
    res.status(500).send('Failed to call client.');
  }
});

// Обработчик для завершения обслуживания
app.post('/end-service', async (req, res) => {
  try {
    const currentClient = (await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'F2',
    })).data.values?.[0]?.[0];
    
    if (!currentClient) {
      throw new Error('No current client in F2');
    }

    const rowIndex = parseInt(currentClient, 10) + 1;
    await endService(rowIndex); // Записываем время завершения обслуживания

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
  try {
    const currentClient = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'F2',
    });
    socket.emit('updateClientNumber', { clientNumber: currentClient.data.values?.[0]?.[0] || 'None' });
  } catch (error) {
    console.error('Error sending client number:', error);
  }
  socket.on('disconnect', () => {
    console.log('Пользователь отключился');
  });
});

// Запуск сервера
server.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});
