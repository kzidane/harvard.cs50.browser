define(function(require, exports, module) {
    main.consumes = [
        "c9", "dialog.error", "Editor", "editors", "layout", "MenuItem",
        "menus", "tabManager", "proc", "settings", "tree"
    ];
    main.provides = ["harvard.cs50.browser"];
    return main;

    function main(options, imports, register) {
        var c9 = imports.c9;
        var Editor = imports.Editor;
        var editors = imports.editors;
        var layout = imports.layout;
        var MenuItem = imports.MenuItem;
        var menus = imports.menus;
        var proc = imports.proc;
        var showError = imports["dialog.error"].show;
        var tabs = imports.tabManager;
        var settings = imports.settings;
        var tree = imports.tree;

        var extname = require("path").extname;

        var extensions = ["db", "db3", "sqlite", "sqlite3"];
        var handle = editors.register("browser", "Browser", Browser, extensions);
        handle.addReloadItem = function() {

            // add "Reload" item once
            if (handle.reloadAdded)
                return;

            // context menu of tab button
            handle.tabMenu = menus.get("context/tabs").menu;
            if (!handle.tabMenu)
                return;

            // create "Reload" item
            handle.reloadItem = new MenuItem({
                caption: "Reload",
                onclick: function() {
                    var tab = tabs.focussedTab;
                    if (tab.editorType === "browser")
                        tab.editor.reloadTab(tab);
                },
                visible: false
            });

            // add "Reload" item to context menu
            menus.addItemByPath("context/tabs/Reload", handle.reloadItem, 0, handle);
            handle.reloadAdded = true;

            // show "Reload" item only if tab is browser
            handle.tabMenu.on("prop.visible", function(e) {
                if (tabs.focussedTab.editorType === "browser" && e.value)
                    handle.reloadItem.show();
                else
                    handle.reloadItem.hide();
            });
        };

        register(null, {
            "harvard.cs50.browser": handle
        });

        /**
         *  Opens files selected in file browser, ensuring phpliteadmin
         * (re)uses a single tab
         */
        function openSelection(opts) {
            if (!c9.has(c9.STORAGE))
                return;

            var sel = tree.tree.selection.getSelectedNodes();
            var db = null;

            // get last selected db file, deselecting all db files temporarily
            sel.forEach(function(node) {
                if (node && node.path && extensions.indexOf(extname(node.path).substring(1)) > -1) {
                    db = node;
                    tree.tree.selection.unselectNode(db);
                }
            });

            // open non-db selected files (if any)
            if (sel.length > 0)
                tree.openSelection(opts);

            // open last selected db file, selecting it back
            if (db) {
                // just focus tab if phpliteadmin is running same db
                var tab = tabs.findTab("phpliteadmin-tab");
                if (tab && tab.document.lastState.browser.path === db.path)
                    return tabs.focusTab(tab);

                tabs.open({
                    name: "phpliteadmin-tab",
                    document: {
                        title: "phpliteadmin",
                        browser: {
                            path: db.path
                        }
                    },
                    editorType: "browser",
                    active: true,
                    focus: true,
                    noanim: sel.length > 1
                }, function (err, tab) {

                    // kill phpliteadmin process when tab closed
                    tab.on("close", function() {
                        var process = tab.document.lastState.browser.process;
                        if (!err && process)
                            process.kill(15);
                    });
                });

                tree.tree.selection.selectNode(db, true);
            }
        }

        /**
         * Spawns phpliteadmin and calls callback, passing in url, or error
         *
         * @param {string} path path of db file
         */
        function startPhpliteadmin(path, callback) {
            if (!path)
                return;

            // leading / is actually ~/workspace/
            if (/^\//.test(path))
                path = c9.workspaceDir + path;

            // manually expand ~ because not expanded automatically
            else if (/^~/.test(path))
                path = path.replace(/^~/, c9.home);

            // spawn phpliteadmin
            proc.spawn("phpliteadmin", { args: [path] }, function(err, process) {
                if (err)
                    return callback(err);

                // keep running after reload
                process.unref();

                // get phpliteadmin url
                var data = "";
                process.stdout.on("data", function handleOutput(chunk) {
                    data += chunk;

                    var matches = data.match(/(https?:\/\/.+)\s/);
                    if (matches && matches[1]) {
                        process.stdout.off("data", handleOutput);
                        callback(null, matches[1], process);
                    }
                });
            });
        }

        // hook new handler for Open to open db files
        tree.tree.off("afterChoose", tree.openSelection);
        tree.tree.on("afterChoose", openSelection);

        function Browser(){
            var plugin = new Editor("CS50", main.consumes, extensions);
            var emit = plugin.getEmitter();

            var loading = false;

            var container, iframe;
            var currDoc, currSession;

            // draw editor
            plugin.on("draw", function(e) {

                // add "Reload" menu item to tab button context menu
                handle.addReloadItem();

                // create and style iframe
                iframe = document.createElement("iframe");
                iframe.style.width = iframe.style.height = "100%";
                iframe.style.borderWidth = "0";
                iframe.style.display = "none";

                // remember container
                container = e.htmlNode;

                // append iframe
                container.appendChild(iframe);
            });

            /**
             * Reloads current built-in browser tab
             */
            function reloadTab(tab) {
                if (tab === currDoc.tab) {

                    // iframe.contentWindow.location.reload violates same-origin
                    updateIframeSrc(iframe.src);
                }
            }

            /**
             * Sets iframe's src attribute to url. If url is omitted, hides
             * iframe and resets its src.
             *
             * @param [string] url URL to set iframe's src to
             */
            function updateIframeSrc(url) {

                // show loading spinner
                currDoc.tab.classList.add("loading");

                if (loading)
                    return;

                loading = true;

                // hide iframe and reset its src if no url given
                if (!url) {
                    iframe.style.display = "none";
                    iframe.src = "";
                    loading = false;
                    return;
                }

                // update src
                iframe.src = url;

                // show iframe
                iframe.style.display = "initial";

                // hide loading spinner from tab button
                currDoc.tab.classList.remove("loading");
                loading = false;
            }

            plugin.on("documentLoad", function(e) {

                // set current document and session
                currDoc = e.doc;
                currSession = currDoc.getSession();

                // set or update iframe's src when url is set or changed
                plugin.on("urlSet", function(e) {
                    updateIframeSrc(e.url);
                });

                /**
                 * Toggles editor's theme based on current skin.
                 */
                function setTheme(e) {
                    if (!currDoc)
                        return;

                    // get document's tab
                    var tab = currDoc.tab;

                    // handle dark themes
                    if (e.theme.indexOf("dark") > -1) {

                        // change tab-button colors
                        container.style.backgroundColor = tab.backgroundColor = "#303130";
                        tab.classList.add("dark");
                    }

                    // handle light themes
                    else {

                        // change tab-button colors
                        container.style.backgroundColor = tab.backgroundColor = "#f1f1f1";
                        tab.classList.remove("dark");
                    }
                }

                // toggle editor's theme when theme changes
                layout.on("themeChange", setTheme, currSession);

                // set editor's theme initially
                setTheme({ theme: settings.get("user/general/@skin") });
            });

            // when path changes
            plugin.on("setState", function(e) {

                // update current document and session
                currDoc = e.doc;
                currSession = currDoc.getSession();

                // reset iframe src
                updateIframeSrc();

                // set or update current db path
                currSession.path = e.state.path;

                // set or update current phpliteadmin process
                currSession.process = e.state.process;

                // if phpliteadmin is already running, use url
                if (e.state.url) {
                    currSession.url = e.state.url;
                    updateIframeSrc(currSession.url);
                    return;
                }

                // spawn phpliteadmin
                startPhpliteadmin(currSession.path, function(err, url, process){
                    if (err)
                        return console.error(err);

                    // set or update session's url
                    currSession.url = url;

                    // set or update phpliteadmin process
                    currSession.process = process;

                    // notify about url change
                    emit("urlSet", { url: url });
                });
            });

            // remember db path and phpliteadmin process between reload
            plugin.on("getState", function(e) {
                if (currSession) {
                    e.state.path = currSession.path;
                    e.state.process = currSession.process;
                    e.state.url = currSession.url;
                }
            });

            plugin.freezePublicAPI({
                reloadTab: reloadTab
            });

            plugin.load(null, "harvard.cs50.browser");

            return plugin;
        }
    }
});
