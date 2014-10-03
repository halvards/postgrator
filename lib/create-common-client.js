// aka "universal" client
// here we'll wrap each of the database drivers in a unified interface

var supportedDrivers = ['pg', 'pg.js', 'mssql', 'mysql'];

module.exports = function (config) {
    
    if (supportedDrivers.indexOf(config.driver) === -1) {
        throw new Error("db driver is not supported. Must either be " + supportedDrivers.join(" or ") + ".");
    }
    
    var commonClient = {
        connected: false,
        dbDriver: require(config.driver), 
        dbConnection: null,
        createConnection: function () {},
        runQuery: function (query, cb) { 
            cb();
        },
        endConnection: function (cb) {
            cb();
        },
        queries: {
            getCurrentVersion: 'SELECT version FROM schemaversion ORDER BY version DESC LIMIT 1',
            checkTable: "",
            makeTable: ""
        }
    };
    
    if (config.driver == 'mysql') {
        
        commonClient.queries.checkTable = "SELECT * FROM information_schema.tables WHERE table_schema = '" + config.database + "' AND table_name = 'schemaversion';";
        commonClient.queries.makeTable = "CREATE TABLE schemaversion (version INT); INSERT INTO schemaversion (version) VALUES (0);";
        
        commonClient.createConnection = function (cb) {
            var connection = commonClient.dbDriver.createConnection({
                multipleStatements: true,
                host: config.host,
                user: config.username,
                password: config.password,
                database: config.database
            });
            commonClient.dbConnection = connection;
            connection.connect(cb);
        };
        
        commonClient.runQuery = function (query, cb) {
            commonClient.dbConnection.query(query, function (err, rows, fields) {
                if (err) {
                    cb(err);
                } else {
                    var results = {};
                    if (rows) results.rows = rows;
                    if (fields) results.fields = fields;
                    cb(err, results);
                }
            });
        };
        
        commonClient.endConnection = function (cb) {
            commonClient.dbConnection.end(cb);
        };
        
        
    } else if (config.driver === 'pg' || config.driver === 'pg.js') {
        
        var connectionString = config.connectionString || "tcp://" + config.username + ":" + config.password + "@" + config.host + "/" + config.database;
        
        commonClient.queries.checkTable = "SELECT * FROM pg_catalog.pg_tables WHERE schemaname = CURRENT_SCHEMA AND tablename = 'schemaversion';";
        commonClient.queries.makeTable = "CREATE TABLE schemaversion (version INT); INSERT INTO schemaversion (version) VALUES (0);";
        
        commonClient.createConnection = function (cb) {
            commonClient.dbConnection = new commonClient.dbDriver.Client(connectionString);
            commonClient.dbConnection.connect(function (err) {
                cb(err);
            });
        };
        
        commonClient.runQuery = function (query, cb) {
            commonClient.dbConnection.query(query, function (err, result) {
                cb(err, result);
            });
        };
        
        commonClient.endConnection = function (cb) {
            commonClient.dbConnection.end();
            process.nextTick(cb);
        };
    
    } else if (config.driver == 'mssql') {
        
        var sqlconfig = {
            user: config.username,
            password: config.password,
            server: config.host,
            database: config.database
        };
        
        commonClient.queries.getCurrentVersion = 'SELECT TOP 1 version FROM schemaversion ORDER BY version DESC';
        commonClient.queries.checkTable = "SELECT * FROM information_schema.tables WHERE table_schema = 'dbo' AND table_name = 'schemaversion'";
        commonClient.queries.makeTable = "CREATE TABLE schemaversion (version INT); INSERT INTO schemaversion (version) VALUES (0);";
        
        commonClient.createConnection = function (cb) {
            commonClient.dbDriver.connect(sqlconfig, function (err) {
                cb(err);
            });
        };
        
        commonClient.runQuery = function (query, cb) {
            var request = new commonClient.dbDriver.Request();
            request.query(query, function (err, result) {
                cb(err, {rows: result});
            });    
        };
        
        commonClient.endConnection = function (cb) {
            // mssql doesn't offer a way to kill a single connection
            // It'll die on its own, and won't prevent us from creating additional connections.
            // eventually this should maybe use the pooling mechanism, even though we only need one connection
            cb();
        };
        
    } else {
        throw new Error("db driver is not supported. Must either be " + supportedDrivers.join(" or ") + ".");
    }
    
    return commonClient;
    
};