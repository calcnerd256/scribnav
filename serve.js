var http = require("http");
var fs = require("fs");

function NOP(){}

function alist2dict(pairs){
    var result = {};
    pairs.map(
	function(kv){
	    result[kv[0]] = kv[1];
	}
    );
    return result;
}

function soakStream(stream, callback){
    var chunks = [];
    stream.on("data", [].push.bind(chunks));
    stream.on(
	"end",
	function(){
	    return callback(
		chunks.join("")
	    );
	}
    );
}
function soakPostForm(request, callback){
    return soakStream(
	request,
	function(body){
	    return callback(
		alist2dict(
		    body.split("&").map(
			function(kv){
			    var tokens = kv.split("=");
			    var k = tokens.shift();
			    var v = tokens.join("=");
			    return [k,v].map(
				function(s){
				    return s.split("+").map(
					decodeURIComponent
				    ).join(" ");
				}
			    );
			}
		    )
		)
	    );
	}
    );
}

function respondOkay(response, contentType, body){
    response.writeHead(200, "OK", {"Content-Type": contentType});
    response.end(body);
}
function notFound(response){
    response.writeHead(404, "Not Found", {"Content-Type": "text/plain"});
    response.end("Not found.");
}
function badMethod(response, allow){
    response.writeHead(
	405,
	"Method Not Allowed",
	{
	    "Content-Type": "text/plain",
	    "Allow": allow.join(", ")
	}
    );
    response.end("That resource does not support that method.");
}

function Page(){
    this.number = Page.pages.length;
    Page.pages[this.number] = this;
    this.text = [];
    this.outlinks = {};
    this.inlinks = [];
}
Page.pages = [];
Page.prototype.setText = function(text){
    this.text.push(text);
};
Page.prototype.getText = function(){
    return this.text[this.text.length - 1];
};
Page.prototype.setLink = function(key, other){
    var update = null;
    if(key in this.outlinks)
	update = Page.pages[this.outlinks[key]];
    this.outlinks[key] = other.number;
    other.inlinks.push([this.number, key]);
    if(null != update)
	update.getBacklinks();
};
Page.prototype.removeLink = function(key, other){
    var update = null;
    if(key in this.outlinks)
	update = Page.pages[this.outlinks[key]];
    delete this.outlinks[key];
    if(null != update)
	update.getBacklinks();
};
Page.prototype.redirectHere = function(response){
    response.writeHead(303, "Confer", {"Location": "/" + +this.number + "/"});
};
Page.prototype.getBacklinks = function(){
    var me = this.number;
    var result = this.inlinks.filter(
	function(pair){
	    var number = pair[0];
	    var key = pair[1];
	    var page = Page.pages[+number];
	    return page.outlinks[key] == me;
	}
    );
    this.inlinks = result;
    return result;
};
Page.prototype.route = function(request, path){
    if(!path.length) return this;
    if(1 == path.length)
	if(!(path[0])) return this;
    if("links" == path[0])
	return {
	    "GET": function(response){
		return respondOkay(
		    response,
		    "application/json",
		    JSON.stringify(
			this.that.outlinks
		    )
		);
	    },
	    "POST": function(response, request){
		var that = this.that;
		soakPostForm(
		    request,
		    function(d){
			if("page" in d){
			    that.setLink(d.key, Page.pages[+d.page]);
			}
			else
			    that.removeLink(d.key);
			respondOkay(response, "text/plain", "saved");
		    }
		);
	    },
	    that: this
	}
    if("backlinks" == path[0])
	return {
	    "GET": function(response){
		var result = {};
		this.that.getBacklinks().map(
		    function(sp){
			var s = sp[0];
			var p = sp[1];
			if(!(s in result)) result[s] = [];
			result[s].push(p);
		    }
		);
		return respondOkay(
		    response,
		    "application/json",
		    JSON.stringify(result)
		);
	    },
	    that: this
	}
};
Page.prototype.GET = function(response){
    return respondOkay(response, "text/plain", this.getText());
};
Page.prototype.POST = function(response, request){
    var that = this;
    soakPostForm(
	request,
	function(formdata){
	    that.setText(formdata.text);
	    return respondOkay(response, "text/plain", "Saved.\n");
	}
    );
};
Page.hydrate = function(them){
    // assumes no pages exist!
    var pages = them.map(
	function(it){
	    var result = new Page();
	    result.source = it;
	    return result;
	}
    );
    pages.map(
	function(page){
	    page.setText(page.source.text);
	    for(var k in page.source.outlinks)
		page.setLink(k, Page.pages[page.source.outlinks[k]]);
	}
    );
};
Page.prototype.serialize = function(){
    return {
	text: this.getText(),
	outlinks: this.outlinks
    };
};
Page.serialize = function(){
    return Page.pages.map(function(page){return page.serialize();});
};
Page.init = function(){
    try{
	Page.hydrate(JSON.parse(fs.readFileSync("./db.json")));
    }
    catch(e){
	var root = new Page();
	root.setText("Start here.");
	root.setLink("loop", root);
    }
    return Page.pages[0];
}

var application = {
    "/index.js": {
	"functions": [
	    function K(x){
		return function(){return x;};
	    },
	    function promiseGet(url){
		return new Promise(
		    function(resolve, reject){
			$.get(url, resolve);
		    }
		);
	    },
	    function promisePost(url, data){
		return new Promise(
		    function(resolve, reject){
			$.post(url, data, resolve);
		    }
		);
	    },
	    function promiseCurrentPageBlurb(pageNumber){
		pageNumber = +pageNumber;
		return promiseGet("/" + pageNumber + "/").then(
		    function(body){
			$("#blurb").text(body);
		    }
		);
	    },
	    function linkToPage(pageNumber){
		pageNumber = +pageNumber;
		var url = "/" + pageNumber + "/";
		var a = document.createElement("a");
		a.appendChild(document.createTextNode(pageNumber));
		a.href = url;
		$(a).click(
		    function(){
			loadPage(pageNumber);
			return false;
		    }
		);
		$(a).hover(
		    function(){
			promiseGet(url).then(
			    function(body){
				$("#preview").text(body);
			    }
			);
		    }
		);
		return a;
	    },
	    function promiseCurrentPageLinks(pageNumber){
		pageNumber = +pageNumber;
		return promiseGet("/" + pageNumber + "/links/").then(
		    function(d){
			var pairs = Object.keys(d).map(
			    function(k){
				var li = document.createElement("li");
				var ref = +d[k];
				var a = linkToPage(ref);
				$(a).text(k);
				li.appendChild(a);
				li.appendChild(document.createTextNode(": "));
				var blurb = document.createElement("span");
				blurb.appendChild(document.createTextNode(ref));
				$(blurb).html(
				    $(blurb).html() + "&hellip;"
				);
				li.appendChild(blurb);
				var promise = promiseGet(a.href).then(
				    function(bod){
					$(blurb).text(bod);
				    }
				);
				var x = document.createElement("a");
				x.href = "#";
				$(x).text("x");
				$(x).click(
				    function(){
					promisePost(
					    "/" + pageNumber + "/links/",
					    {key: k}
					).then(
					    function(){
						return Promise.all(
						    [
							loadPage(pageNumber),
							promiseBagAdd(ref)
						    ]
						);
					    }
					);
					return false;
				    }
				);
				li.appendChild(x);
				return [li, promise];
			    }
			);
			$("#links").html(
			    pairs.map(
				function(lp){return lp[0];}
			    )
			);
			return Promise.all(
			    pairs.map(function(lp){return lp[1];})
			);
		    }
		);
	    },
	    function promiseCurrentPageBacklinks(pageNumber){
		pageNumber = +pageNumber;
		return promiseGet("/" + pageNumber + "/backlinks/").then(
		    function(d){
			var pairs = Object.keys(d).map(
			    function(page){
				page = +page;
				var ks = d[page];
				var li = document.createElement("li");
				li.appendChild(linkToPage(page));
				var ul = document.createElement("ul");
				li.appendChild(ul);
				var bod = document.createElement("span");
				li.appendChild(bod);
				var promise = promiseGet("/" + page + "/").then(
				    function(text){
					$(bod).text(text);
				    }
				);
				$(ul).html(
				    ks.map(
					function(k){
					    var li = document.createElement(
						"li"
					    );
					    li.appendChild(
						document.createTextNode(k)
					    );
					    return li;
					}
				    )
				);
				return [li, promise];
			    }
			);
			$("#backlinks").html(
			    pairs.map(function(lp){return lp[0];})
			);
			return Promise.all(
			    pairs.map(function(lp){return lp[1];})
			);
		    }
		);
	    },
	    function loadPage(pageNumber){
		var scribnav = window.scribnav;
		promiseBagAdd(scribnav.pageNumber);
		window.desiredPage = pageNumber;
		var numElem = document.getElementById("pageNumber");
		$(numElem).html(
		    $(numElem).html() + "&rarr;" + +pageNumber
		);
		Promise.all(
		    [
			promiseCurrentPageBlurb(+pageNumber),
			promiseCurrentPageLinks(+pageNumber),
			promiseCurrentPageBacklinks(+pageNumber),
			Promise.resolve()
		    ]
		).then(
		    function(){
			$(numElem).text(pageNumber);
			scribnav.pageNumber = pageNumber;
			return promiseBagAdd(pageNumber);
		    }
		);
	    },
	    function promiseBagAdd(pageNumber){
		pageNumber = +pageNumber;
		var scribnav = window.scribnav;
		scribnav.bag[pageNumber] = true;
		localStorage["scribnav bag"] = Object.keys(
		    scribnav.bag
		).join(" ");
		var liId = "bagitem_" + pageNumber;
		if($("#" + liId).length) return;
		var li = document.createElement("li");
		li.id = liId;
		li.appendChild(linkToPage(pageNumber));
		var blurb = document.createElement("span");
		li.appendChild(blurb);
		var promise = promiseGet("/" + pageNumber + "/").then(
		    function(body){
			$(blurb).text(body);
		    }
		).then(
		    function(){
			var pairs = Object.keys(scribnav.bag).map(
			    function(k){
				k = +k;
				var result = document.createElement("option");
				$(result).text(k);
				var promise = promiseGet("/" + k + "/").then(
				    function(body){
					$(result).text(body);
				    }
				);
				result.value = k;
				return [result, promise];
			    }
			);
			$("#bagselect").html(
			    pairs.map(function(op){return op[0];})
			);
			return Promise.all(
			    pairs.map(function(op){return op[1];})
			);
		    }
		);
		var x = document.createElement("a");
		$(x).text("x");
		x.href = "#";
		$(x).click(
		    function(){
			$(li).remove();
			delete scribnav.bag[pageNumber];
			localStorage["scribnav bag"] = Object.keys(
			    scribnav.bag
			).join(" ");
			return false;
		    }
		);
		li.append(x);
		$("#bag").prepend(li);
		return promise;
	    },
	    function init(){
		var scribnav = {
		    bag: {}
		};
		window.scribnav = scribnav;
		$(
		    function(){
			scribnav.pageNumber = 0;
			$("#bagadd").click(
			    function(){
				promiseBagAdd(+scribnav.pageNumber);
				return false;
			    }
			);
			$("#bagnew").submit(
			    function(){
				promisePost(
				    "/",
				    {
					text: document.getElementById(
					    "newBody"
					).value
				    }
				).then(
				    function(pageNumber){
					return Promise.all(
					    [
						promiseBagAdd(pageNumber),
						loadPage(pageNumber),
						promisePost("/save/", {})
					    ]
					);
				    }
				);
				return false;
			    }
			);
			$("#linknew").submit(
			    function(){
				var k = document.getElementById("key").value;
				var page = document.getElementById(
				    "bagselect"
				).value;
				var here = +(window.scribnav.pageNumber);
				promisePost(
				    "/" + here + "/links/",
				    {key: k, page: +page}
				).then(
				    function(){
					return Promise.all(
					    [
						loadPage(here),
						promisePost("/save/", {})
					    ]
					);
				    }
				);
				return false;
			    }
			);
			$("#bodyEdit").click(
			    function(){
				var f = document.createElement("form");
				var t = document.createElement("textarea");
				f.appendChild(t);
				t.value = $("#blurb").text();
				var s = document.createElement("input");
				f.appendChild(s);
				s.type = "submit";
				s.value = "save";
				$("#blurb").html(f);
				$(f).submit(
				    function(){
					var n = window.scribnav.pageNumber;
					promisePost(
					    "/" + n + "/",
					    {text: t.value}
					).then(
					    function(){
						loadPage(n);
					    }
					);
					return false;
				    }
				);
			    }
			);
			if("scribnav bag" in localStorage)
			    localStorage["scribnav bag"].split(" ").map(
				promiseBagAdd
			    );
			loadPage(0);
		    }
		);
	    },
	    ""
	],
	"GET": function(response){
	    return respondOkay(
		response,
		"application/javascript",
		this.functions.join("\n\n")
	    );
	},
	sentinel: null
    },
    "/save/": {
	"POST": function(response){
	    fs.writeFile(
		"./db.json",
		JSON.stringify(Page.serialize(), null, 1),
		function(err){
		    if(err)
			return response.end("failed!\n"); // TODO
		    response.end("saved\n");
		}
	    );
	},
	sentinel: null
    },
    "/": {
	"GET": function(response){
	    return respondOkay(
		response,
		"text/html",
		[
		    "<html>",
		    " <head>",
		    " <meta charset=\"utf-8\" />",
		    " <title>scribnav</title>",
		    [
			"  ",
			"<script",
			" src=\"",
			[
			    "https:",
			    "",
			    ["ajax", "googleapis", "com"].join("."),
			    "ajax",
			    "libs",
			    "jquery",
			    ["3", "2", "1"].join("."),
			    ["jquery", "min", "js"].join(".")
			].join("/"),
			"\"",
			">",
			"</script>"
		    ].join(""),
		    "  <script src=\"/index.js\"></script>",
		    "  <script>init()</script>",
		    "  <style>",
		    "   .page{",
		    "    float: left;",
		    "    border: 1px solid black;",
		    "    max-width: 50%;",
		    "   }",
		    "   #preview{",
		    "    min-height: 10ex;",
		    "   }",
		    "  </style>",
		    " </head>",
		    " <body>",
		    "  <ul id=\"breadcrumbs\"></ul>",
		    "  <div class=\"page\">",
		    "   <h1 id=\"pageNumber\">-</h1>",
		    "   <div id=\"blurb\"></div>",
		    "   (<a href=\"#\" id=\"bagadd\">add to bag</a>)",
		    "   (<a href=\"#\" id=\"bodyEdit\">edit</a>)",
		    "   <h2>links</h2>",
		    "   <ul id=\"links\"></ul>",
		    "   <form id=\"linknew\">",
		    "    <input id=\"key\"></input>",
		    "    <select id=\"bagselect\"></select>",
		    "    <input type=\"submit\" value=\"new\"></input>",
		    "    <input type=\"reset\"></input>",
		    "   </form>",
		    "   <h2>backlinks</h2>",
		    "   <ul id=\"backlinks\"></ul>",
		    "  </div>",
		    "  <h1>preview</h1>",
		    "  <div id=\"preview\"></div>",
		    "  <div class=\"bag\">",
		    "   <h1>bag</h1>",
		    "   <form id=\"bagnew\">",
		    "    <textarea id=\"newBody\"></textarea>",
		    "    <input type=\"submit\" value=\"new\"></input>",
		    "   </form>",
		    "   <ul id=\"bag\"></ul>",
		    "  </div>",
		    " </body>",
		    "</html>",
		    ""
		].join("\r\n")
	    );
	},
	"POST": function(response, request){
	    soakPostForm(
		request,
		function(formdata){
		    var p = new Page();
		    p.setText(formdata.text);
		    respondOkay(response, "text/plain", ""+p.number);
		}
	    );
	},
	sentinel: null
    },
    route: function(request){
	var u = request.url;
	var tokens = u.split("?").shift().split("/");
	if(tokens.shift()) return;
	if(u in this) return this[u];
	var pageNumber = tokens.shift();
	if(("" + (+pageNumber)) != ("" + pageNumber))
	    return;
	pageNumber = +pageNumber;
	var page = Page.pages[pageNumber];
	if(!page) return null;
	return page.route(request, tokens);
    },
    sentinel: null
};

function init(port, callback){
    Page.init();
    var server = http.createServer(
	function(request, response){
	    var resource = application.route(request);
	    if(null == resource)
		return notFound(response);
	    var m = request.method.toUpperCase();
	    if(!(m in resource))
		return badMethod(
		    response,
		    "GET POST HEAD DELETE PUT".split(" ").map(
			function(method){
			    return method in resource;
			}
		    )
		);
	    return resource[m](response, request);
	}
    );
    server.listen(
	+port,
	function(){
	    console.log("http://localhost:" + +port + "/");
	    callback();
	}
    );
}


var port = 8081;
if(2 < process.argv.length)
    port = +(process.argv[2]);

init(port, NOP);
