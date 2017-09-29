define(function(require, exports, module) {
    main.consumes = ["Editor", "editors", "layout", "settings", "tabManager"];
    main.provides = ["harvard.cs50.browser"];

    return main;

    function main(options, imports, register) {
        var Editor = imports.Editor;
        var editors = imports.editors;
        var layout = imports.layout;
        var settings = imports.settings;
        var tabs = imports.tabManager;

        var basename = require("path").basename;

        var extensions = ["db", "db3", "sqlite", "sqlite3"];
        var handle = editors.register("browser", "Browser", Browser, extensions);

        // close any other open tabs for same editor
        tabs.on("tabCreate", function(e) {
            if (e.tab.editorType === "browser") {
                tabs.getTabs().forEach(function(tab) {
                    if (tab.editorType === "browser" && tab !== e.tab)
                        tab.close();
                });
            }
        });

        function Browser() {
            var plugin = new Editor("CS50", main.consumes, extensions);

            var container;
            var iframe;

            // draw editor
            plugin.on("draw", function(e) {

                // capture container
                container = e.htmlNode;

                // create iframe
                iframe = document.createElement("iframe");

                // style iframe
                iframe.style.background = "white";
                iframe.style.borderWidth = "0";
                iframe.style.display = "none";
                iframe.style.width = iframe.style.height = "100%";

                // insert iframe into the page
                container.appendChild(iframe);
            });


            // handle loading documents
            plugin.on("documentLoad", function(e) {

                var doc = e.doc;
                var session = doc.getSession();

                /**
                 * Sets document's title and tooltip to basename of path
                 */
                function setTitle(e) {
                    doc.title = doc.tooltip = basename(e.path);
                }

                // change tab title when file is renamed
                doc.tab.on("setPath", setTitle, session);

                /**
                 * Changes editor's theme based on skin
                 */
				function setTheme(e) {
                    var tab = doc.tab;

                    // change editor's theme based on skin
                    if (e.theme.indexOf("dark") > -1) {
                        container.style.backgroundColor = tab.backgroundColor = "#303130";
                        tab.classList.add("dark");
                    }
                    else {
                        container.style.backgroundColor = tab.backgroundColor = "#f1f1f1";
                        tab.classList.remove("dark");
                    }
                }

                // set editor's theme initially
                setTheme({ theme: settings.get("user/general/@skin") });

                // change editor's theme when skin changes
                layout.on("themeChange", setTheme, session);
            });

            plugin.freezePublicAPI({});
            plugin.load(null, "harvard.cs50.browser");
            return plugin;
        }

        register(null, { "harvard.cs50.browser": handle });
    }
});
