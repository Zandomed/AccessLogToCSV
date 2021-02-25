const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const { format } = require("date-fns");

/**
 * @function
 * Inicializa la conexión con la base de datos
 */
const initializeDatabase = () => {
  const adapter = new FileSync("db.json");
  const db = low(adapter);
  const columnDB = "filesCSV";

  /**
   * Set default Database
   */
  db.defaults({
    [columnDB]: {},
  }).write();

  /**
   * @function
   * Obtiene la fecha del momento la cual se convierte en el nombre del
   * archivo CSV
   */
  const getNameFile = () => format(new Date(), "yyyy-MM-dd");

  /**
   * @functions
   * Comprueba si existe la propiedad en la Base de datos
   * @param {string} name Nombre de la propiedad que combrobaremos en la base de datos
   */
  const existFileInDB = (name = getNameFile()) =>
    db.has(`${columnDB}.${name}`).value();

  /**
   * @function
   * Obtiene todos los registros de los archivos CSV almacenados en la
   * base de datos
   */
  const getFiles = () => db.get(columnDB).value();

  /**
   * @function
   * Agrega un nuevo registro a la base de datos
   * @param {string} name Nombre la propiedad que se va a agregar a
   * la base de datos
   */
  const setFile = (name = getNameFile()) =>
    db
      .set(`${columnDB}.${name}`, {
        date: Date.now(),
        nameFile: `${name}.csv`,
        name,
      })
      .write();

  return {
    db,
    getNameFile,
    existFileInDB,
    getFiles,
    setFile,
  };
};

module.exports = {
  initializeDatabase,
};
