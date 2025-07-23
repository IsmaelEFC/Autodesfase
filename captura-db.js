let db;
const DB_NAME = "CapturaSyncDB";
const STORE_NAME = "capturas";

function abrirDB() {
  const request = indexedDB.open(DB_NAME, 1);

  request.onupgradeneeded = event => {
    db = event.target.result;
    db.createObjectStore(STORE_NAME, { keyPath: "id" });
  };

  request.onsuccess = () => {
    db = request.result;
  };
}

function guardarCaptura(data) {
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.add(data);
}

function cargarCapturas(callback) {
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();

  request.onsuccess = () => {
    callback(request.result);
  };
}
