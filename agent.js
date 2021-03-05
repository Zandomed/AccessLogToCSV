const fastify = require("fastify")({
  logger: false,
});
const fs = require("fs-extra");
const { resolve } = require("path");

const REGEXP_FOR_CONTENT = new RegExp(/.+/, "gm");
const PORT_FOR_SOCKET = 4000;
const BREAK_LINE = `\r\n`;

/**
 * Nombre del archivo access
 */
const NAME_FILE_LOG = "access_log";

/**
 * Ubicacion del archivo access_log
 */
const URI_FILE_LOG = resolve("/var", "log", "apache2", NAME_FILE_LOG);
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

let lengthLineFileLog = 0;

const listeneLogFile = () => {
  if (fs.existsSync(URI_FILE_LOG)) {
    lengthLineFileLog = getLengthLog();
    fs.watchFile(
      URI_FILE_LOG,
      { interval: 1000, persistent: true },
      (curr, prev) => {
        const matchRegexpIterable = applyRegExpInFileLog();

        if (matchRegexpIterable) {
          const listLog = Array.from(matchRegexpIterable);
          const lengthLineFileLogNow = listLog.length;
          const listLogFilterNews = listLog.splice(
            lengthLineFileLog,
            lengthLineFileLogNow - lengthLineFileLog
          );
          fastify.io.emit("change_log", listLogFilterNews[0][0]);
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
};

fastify.register(require("fastify-socket.io"), {
  serveClient: false,
  cookie: false,
});

fastify.ready((err) => {
  if (err) throw err;
  fastify.io.on("connect", (socket) =>
    console.info("Socket connected!", socket.id)
  );

  listeneLogFile();
});
/**
 * Inicializar el servidor Web
 */
fastify.listen(PORT_FOR_SOCKET, "::", (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server Socket listening on ${PORT_FOR_SOCKET}`);
  console.log(`Server Socket listening on ${PORT_FOR_SOCKET}`);
});
