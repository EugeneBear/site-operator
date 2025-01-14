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
  
  for (let i = 1; i < rows.length; i++) { // Начинаем с A2 (первая строка в данных - A1)
    const clientNumber = rows[i][0]; // Номер в столбце A
    const callTime = rows[i][6]; // Время в столбце G
    
    if (!callTime) {
      return { clientNumber, rowIndex: i + 2 }; // Номер клиента и индекс строки
    }
  }
  throw new Error('No available clients found.');
}

// Функция для записи времени начала и завершения обслуживания
async function callClientWithTime(rowIndex) {
  const currentTime = new Date().toISOString();
  
  // Записываем в G (начало обслуживания) и F (завершение обслуживания)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      data: [
        {
          range: `G${rowIndex}`,
          values: [[currentTime]],
        },
        {
          range: `F${rowIndex}`,
          values: [[currentTime]],
        },
      ],
      valueInputOption: 'RAW',
    },
  });
}

// Обработчик для вызова клиента
app.post('/call-client', async (req, res) => {
  try {
    const { clientNumber, rowIndex } = await findNextAvailableClient();
    await callClientWithTime(rowIndex); // Записываем времена
    io.emit('clientCalled', { clientNumber });
    res.status(200).send({ message: 'Client called successfully', clientNumber });
  } catch (error) {
    console.error('Error calling client:', error);
    res.status(500).send('Failed to call client.');
  }
});

// WebSocket
io.on('connection', async (socket) => {
  console.log('Новое соединение установлено');

  // Отправляем текущий номер клиенту сразу после подключения
  try {
    const { clientNumber } = await findNextAvailableClient();
    socket.emit('updateClientNumber', { clientNumber });
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
