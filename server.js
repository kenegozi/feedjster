var http = require('http'),
    url = require('url'),
    querystring = require('querystring'),
    feedparser = require('feedparser'),
    request = require('request'),
    zlib = require('zlib'),
    fs = require('fs');

function transformToJson(rssRequest, response, body) {
    feedparser.parseString(body, { addmeta: false }, function (err, meta, articles) {
        if (err) {
            console.log(err);
            response.writeHead(500);
            response.end("error parsing feed");
            return;
        }
        var headersToWrite = {};
        headersToWrite.date = rssRequest['date'];
        // headersToWrite["content-encoding"] = 'utf-8';
        headersToWrite["Content-Type"] = 'application/json; charset=utf-8';
        response.writeHead(rssRequest.statusCode, headersToWrite);

        var metaToWrite = {
            title: meta.title,
            description: meta.description,
            link: meta.link
        }
        if (meta.image && meta.image.url) {
            metaToWrite.imageUrl = meta.image.url;
        }

        response.write('{ "title" :' + JSON.stringify(meta.title) + ", ");
        response.write('  "description" :' + JSON.stringify(meta.description) + ", ");
        response.write('  "link" :' + JSON.stringify(meta.link) + ", ");
        if (meta.image && meta.image.url) {
            response.write('  "imageUrl" :' + JSON.stringify(meta.image.url) + ", ");
        }
        response.write(' "episodes": [\r\n');
        var first = true;
        articles.forEach(function (article) {
            var articleToWrite = {
                guid: article.guid,
                title: article.title,
                date: article.date
            }
            if (article["itunes:duration"] && article["itunes:duration"]["#"]) {
                articleToWrite.duration = article["itunes:duration"]["#"];
            }
            if (article.enclosures && article.enclosures.length > 0) {
                articleToWrite.downloadLink = article.enclosures[0].url;
            }
            if (!first) {
                response.write(',\r\n');
            } else {
                first = false;
            }
            response.write(JSON.stringify(articleToWrite));
        });
        response.write('\r\n]\r\n}');
        response.end();
    });
}

function normalizePath(requestedPath){
    if (requestedPath.length === 0) {
        requestedPath = '/';
    }
    if (requestedPath.length > 1 && requestedPath.lastIndexOf('/') === requestedPath.length - 1) {
        requestedPath = requestedPath.substr(0, requestedPath.length - 1);
    }
    return requestedPath;
}

http.createServer(function (req, res) {
    var requestUrl = url.parse(req.url);
    var requestQuerystring = querystring.parse(requestUrl.query);

    var requestedPath = requestUrl.pathname;

    if (requestedPath !== '/feed') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('not here!');
        return;
    }

    var appkey = process.env.appkey.toUpperCase();
    var requestAppkey = requestQuerystring.appkey;
    if (!requestAppkey) {
        res.writeHead(401, { 'Content-Type': 'text/html' });
        res.end('missing appkey');
        return;
    }
    if (requestAppkey.toUpperCase() !== appkey) {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('NO YOU CANNOT!');
        return;
    }

    var reqObj = {
        uri: requestQuerystring.url,
        headers: JSON.parse(JSON.stringify(req.headers))
    };
    delete reqObj.headers.host;
    reqObj.encoding = null;
    delete reqObj.headers.accept;

    // parseString()
    request(reqObj, function (err, r, body) {
        if (err) {
            console.log('err: ' + err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('remote server call err\r\n: ' + err);
            return;
        }
        if (r.statusCode !== 200) {
            console.log('status: ' + r.statusCode);
            res.writeHead(r.statusCode, r.headers);
            res.end(body);
            return;
        }
        if (r.headers['content-encoding']
                    && r.headers['content-encoding']
                       .toLowerCase().indexOf('gzip') > -1) {
            console.log('zipped');
            zlib.gunzip(r.body, function (err, bodyText) {
                if (err) {
                    console.log('err');
                    res.writeHead(200);
                    res.end('err: ' + err);
                    return;
                }
                //bodyText = bodyText.toString('utf-8');
                transformToJson(r, res, bodyText.toString('utf-8'));
                return;
            });
            return;
        }
        transformToJson(r, res, body);
    });


}).listen(process.env.PORT || 8080);