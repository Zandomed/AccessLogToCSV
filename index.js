const fs = require("fs-extra");
const { resolve } = require("path");
const { initializeDatabase } = require("./database");
const fastify = require("fastify")({
  logger: false,
});

const io = require("socket.io-client");

const { getNameFile, existFileInDB, setFile, getFiles } = initializeDatabase();

/**
 * Puerto de servidor Web
 */
const PORT = 5000;
const PORT_SOCKET = 4000;
const URL_CONNECT_SOCKET = `http://localhost:${PORT_SOCKET}`;
const BREAK_LINE = `\r\n`;
const REGEXP_FOR_CONTENT = new RegExp(
  /(?<ip>(?:(?:[1-9]?[0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}(?:[1-9]?[0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])|localhost|::1) (?<separator>\-) (?<user>.+|\-) \[(?<date>.+)\] \"(\-|(?<method>.*) (?<url>.*)? (?<protocol>.*)?)\" (?<code>[0-9]{3}) (?<byte>\d+|-)/,
  "gm"
);
const REGEXP_FOR_SUBSTITUTION_SCORE = new RegExp(/^\-$/, "gm");
const HEADER_FILE =
  "IP;IDENTIDAD;USER;FECHA Y HORA;METODO;PETICION URL;PROTOCOLO;CODIGO ESTADO;TAMAÑO" +
  BREAK_LINE;
const socket = io(URL_CONNECT_SOCKET);

/**
 * Variables de uso interno
 * (No Modificar)
 */
let fileStreamCSV = null;
let NAME_FILE_CSV = "";
let NAME_FILE_WITHOUT_EXT = "";

/**
 * Nombre del directorio donde se almacenaran los CSV
 */
const NAME_DIR_CSV = "files";

/**
 * Ubicacion de la carpeta de los archivos CSV
 */
const URI_DIR_CSV = resolve(__dirname, NAME_DIR_CSV);

/**
 * @function
 * Obtiene la URI del archivo CSV indicado
 * @param {string} nameFile Nombre del CSV a obtener el URI
 */
const getUriFileCSV = (nameFile = NAME_FILE_CSV) =>
  resolve(__dirname, NAME_DIR_CSV, nameFile);

/**
 * @function
 * Settea un nuevo nombre de archivo y lo crea en la carpeta de Files
 * @param {string} nameFile Nombre del archivo a crear y usar
 */
const setNewNameFile = (nameFile) => {
  NAME_FILE_WITHOUT_EXT = nameFile;
  NAME_FILE_CSV = `${nameFile}.csv`;
  setFile(nameFile);
};

/**
 * @function
 * Abre el Stream de escritura del archivo CSV
 */
const openWriteStreamCSV = (nameFile = NAME_FILE_CSV) =>
  fs.createWriteStream(getUriFileCSV(nameFile), {
    autoClose: true,
    encoding: "utf-8",
    flags: "a",
  });

/**
 * Abre el stream de lectura del archivo CSV
 * @param {string} nameFile Nombre del archivo a leer
 */
const openReadStreamCSV = (nameFile = NAME_FILE_CSV) =>
  fs.createReadStream(getUriFileCSV(nameFile), { autoClose: true });

/**
 * @function
 * Aplica la expresión regular al archivo Log para obtener cada linea del Log organizada
 */
const applyRegExpInFileLog = (value) => value.matchAll(REGEXP_FOR_CONTENT);

/**
 * Validación de existencia de archivo CSV; En caso contrario, crear la
 * carpeta y archivo para su escritura
 */
if (!fs.existsSync(URI_DIR_CSV)) {
  fs.emptyDirSync(URI_DIR_CSV);
}

const nameFile = getNameFile();
fileStreamCSV = openWriteStreamCSV(`${nameFile}.csv`);

if (!existFileInDB(nameFile)) {
  fileStreamCSV.write(HEADER_FILE);
}

/**
 * Setteo del nombre del archivo a trabajar al inicializar al script
 */
setNewNameFile(nameFile);

socket.on("change_log", (lineLog) => {
  if (!existFileInDB()) {
    const fileName = getNameFile();
    fileStreamCSV = openWriteStreamCSV(`${nameFile}.csv`);
    fileStreamCSV.write(HEADER_FILE);
    setNewNameFile(fileName);
  }

  const matchRegexpIterable = applyRegExpInFileLog(lineLog);
  if (matchRegexpIterable) {
    const listLog = Array.from(matchRegexpIterable);

    for (const log of listLog) {
      const values = Object.values(log.groups).map((value) =>
        value ? value.replace(REGEXP_FOR_SUBSTITUTION_SCORE, "0") : "0"
      );
      fileStreamCSV.write(`${values.join(";")}${BREAK_LINE}`);
    }
  }
});

// }

/*--------------------------------------------------------------------- */
/*                              Servidor Web                            */
/*--------------------------------------------------------------------- */

fastify.get("/", async (request, reply) => {
  const host = request.headers.host;
  return {
    message: "Server online",
    endpoints: {
      getAllCSV: `http://${host}/get-all-csv`,
      getUniqueCSV: `http://${host}/get-csv/${NAME_FILE_WITHOUT_EXT}`,
      getLastCSV: `http://${host}/get-last-csv`,
    },
  };
});

fastify.get("/get-all-csv", async (request, reply) => {
  const listFiles = Object.values(getFiles());
  return {
    latest: listFiles[listFiles.length - 1],
    list: listFiles,
  };
});

fastify.get("/get-csv/:file", async (request, reply) => {
  const fileName = request.params.file;
  let file;
  if (existFileInDB(fileName)) {
    file = openReadStreamCSV(`${fileName}.csv`);
    reply.header("Content-disposition", `attachment; filename=${fileName}.csv`);
    reply.header("Content-Type", "text/csv");
    reply.status(200).send(file);
    return new Promise();
  } else {
    reply.status(404);
    return `Not Found File CSV with date: ${fileName}`;
  }
});

fastify.get("/get-last-csv", async (request, reply) => {
  const fileName = NAME_FILE_WITHOUT_EXT;
  if (existFileInDB(fileName)) {
    const file = openReadStreamCSV(`${fileName}.csv`);
    reply.header("Content-disposition", `attachment; filename=${fileName}.csv`);
    reply.header("Content-Type", "text/csv");
    reply.status(200).send(file);
    return new Promise();
  } else {
    reply.status(404);
    return `Not Found File CSV with date: ${fileName}`;
  }
});

/**
 * Inicializar el servidor Web
 */
fastify.listen(PORT, "::", (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`server listening on ${address}`);
});
//
