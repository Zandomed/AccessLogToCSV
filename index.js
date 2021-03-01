const fs = require("fs-extra");
const { resolve } = require("path");
const { initializeDatabase } = require("./database");
const fastify = require("fastify")({
  logger: false,
});
const { getNameFile, existFileInDB, setFile, getFiles } = initializeDatabase();

/**
 * Puerto de servidor Web
 */
const PORT = 5000;
const BREAK_LINE = `\r\n`;
const REGEXP_FOR_CONTENT = new RegExp(
  /(?<ip>(?:(?:[1-9]?[0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}(?:[1-9]?[0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])|localhost|::1) (?<separator>\-) (?<user>.+|\-) \[(?<date>.+)\] \"(?<method>GET|POST|PUT|DELETE|OPTIONS|CONNECT|\-).*\" (?<code>[0-9]{3}) (?<byte>\d+|-)/,
  "gm"
);
const REGEXP_FOR_SUBSTITUTION_SCORE = new RegExp(/^\-$/, "gm");

/**
 * Variables de uso interno
 * (No Modificar)
 */
let fileStreamCSV = null;
let lengthLineFileLog = 0;
let NAME_FILE_CSV = "";
let NAME_FILE_WITHOUT_EXT = "";

/**
 * Nombre del archivo access
 */
const NAME_FILE_LOG = "access_log";
/**
 * Nombre del directorio donde se almacenaran los CSV
 */
const NAME_DIR_CSV = "files";

/**
 * Ubicacion de la carpeta de los archivos CSV
 */
const URI_DIR_CSV = resolve(__dirname, NAME_DIR_CSV);
/**
 * Ubicacion del archivo access_log
 */
const URI_FILE_LOG = resolve("/var", "log", "apache2", NAME_FILE_LOG);

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
const openWriteStreamCSV = () =>
  fs.createWriteStream(getUriFileCSV(), {
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
 * Lee el contenido del archivo Log codificado en UTF-8
 */
const readFileLog = () => fs.readFileSync(URI_FILE_LOG, { encoding: "utf-8" });

/**
 * @function
 * Aplica la expresión regular al archivo Log para obtener cada linea del Log organizada
 */
const applyRegExpInFileLog = () => readFileLog().matchAll(REGEXP_FOR_CONTENT);
/**
 * @function
 * Obtiene la longitud actual de filas del archivo Log
 */
const getLengthLog = () => {
  const formatMatchLog = applyRegExpInFileLog();
  return formatMatchLog ? Array.from(formatMatchLog).length : 0;
};

/**
 * Setteo del nombre del archivo a trabajar al inicializar al script
 */
setNewNameFile(getNameFile());

/**
 * Validación de existencia de archivo CSV; En caso contrario, crear la
 * carpeta y archivo para su escritura
 */
if (!fs.existsSync(URI_DIR_CSV)) {
  fs.emptyDirSync(URI_DIR_CSV);
}

fileStreamCSV = openWriteStreamCSV();

if (fs.existsSync(URI_FILE_LOG)) {
  lengthLineFileLog = getLengthLog();
  fs.watchFile(
    URI_FILE_LOG,
    { interval: 1000, persistent: true },
    (curr, prev) => {
      if (!existFileInDB()) {
        setNewNameFile(getNameFile());
        fileStreamCSV = openWriteStreamCSV();
        lengthLineFileLog = 0;
      }

      const matchRegexpIterable = applyRegExpInFileLog();

      if (matchRegexpIterable) {
        const listLog = Array.from(matchRegexpIterable);
        const lengthLineFileLogNow = listLog.length;
        const listLogFilterNews = listLog.splice(
          lengthLineFileLog,
          lengthLineFileLogNow - lengthLineFileLog
        );
        for (const log of listLogFilterNews) {
          const values = Object.values(log.groups).map((value) =>
            value.replace(REGEXP_FOR_SUBSTITUTION_SCORE, "0")
          );
          fileStreamCSV.write(`${values.join(";")}${BREAK_LINE}`);
        }
        lengthLineFileLog = lengthLineFileLogNow;
      } else {
        lengthLineFileLog = 0;
      }
    }
  );
} else {
  console.error(`No exist File access.log in ${URI_FILE_LOG}${BREAK_LINE}`);
  process.exit(0);
}

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
