const { app, BrowserWindow, session, ipcMain } = require('electron');

let mainWindow;
let authWindow;
let classesWindow;
let savedCookieHeader = '';

const ADFS_URL = 'https://adfs.pjwstk.edu.pl/adfs/oauth2/authorize/?' +
  'client_id=dfbccf57-9d86-4eac-aff7-1485aee6206e' +
  '&redirect_uri=https%3A%2F%2Fgakko.pjwstk.edu.pl%2Fsignin-oidc' +
  '&response_type=id_token' +
  '&scope=openid%20profile' +
  '&response_mode=form_post' +
  '&nonce=' + Date.now() +
  '&state=localtest';

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 650,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'Gakko Auth',
    resizable: true,
  });
  mainWindow.loadFile('index.html');
}

function openAuthWindow() {
  session.defaultSession.clearStorageData();

  authWindow = new BrowserWindow({
    width: 520,
    height: 660,
    title: 'Logowanie PJWSTK',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  authWindow.loadURL(ADFS_URL);

  // Po zalogowaniu ADFS robi form_post na signin-oidc,
  // Gakko przetwarza token i przekierowuje na stronę główną.
  // Czekamy na tę nawigację.
  authWindow.webContents.on('did-navigate', async (event, url) => {
    if (url.startsWith('https://gakko.pjwstk.edu.pl') && !url.includes('signin-oidc')) {
      await grabCookiesAndClose();
    }
  });

  authWindow.on('closed', () => { authWindow = null; });
}

async function grabCookiesAndClose() {
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: 'gakko.pjwstk.edu.pl' });
    if (cookies.length === 0) return;

    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    savedCookieHeader = cookieHeader; // Save for classes window

    const sessionCookie = cookies.find(c => c.name === '.AspNetCore.Cookies');
    const csrfCookie    = cookies.find(c => c.name.startsWith('.AspNetCore.Antiforgery'));

    console.log('\n=== COOKIES PRZECHWYCONE ===');
    cookies.forEach(c => console.log(`${c.name}: ${c.value.substring(0,60)}...`));

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('session-ready', {
        cookieHeader,
        sessionCookie: sessionCookie?.value,
        csrfToken: csrfCookie?.value,
        allCookies: cookies.map(c => ({ name: c.name, value: c.value })),
      });
    }

    if (authWindow && !authWindow.isDestroyed()) authWindow.close();

  } catch (e) {
    console.error('Blad cookies:', e);
  }
}

app.whenReady().then(createMainWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function createClassesWindow(cookieHeader) {
  if (classesWindow && !classesWindow.isDestroyed()) {
    classesWindow.focus();
    return;
  }

  classesWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'My Weekly Classes',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  classesWindow.loadFile('classes.html');

  // Send cookie data once the window is ready
  classesWindow.webContents.once('did-finish-load', () => {
    classesWindow.webContents.send('cookie-data', { cookieHeader });
  });

  classesWindow.on('closed', () => { classesWindow = null; });
}

ipcMain.on('start-login', () => openAuthWindow());

ipcMain.on('open-classes-window', (event, data) => {
  createClassesWindow(data.cookieHeader || savedCookieHeader);
});

ipcMain.on('request-cookie-data', (event) => {
  if (savedCookieHeader) {
    event.sender.send('cookie-data', { cookieHeader: savedCookieHeader });
  }
});
