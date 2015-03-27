(function () {
    'use_strict';
    
    console.log = function() {};
    console.info = function() {};
    
    return {
        // Properties
        defaultState: 'loading',
        magentoEndpoint: '',
        appCreated: false,
        oauth_token_secret: false,
        resources: {
            PROFILE_URI: '%@/api/rest/zendesk/customer/%@',
            INITIATE: '%@/oauth/initiate%@',
            TOKEN: '%@/oauth/token%@',
            ORDER_URI: '%@/api/rest/zendesk/order/%@'
        },
        events: {
            'app.created': 'init',
            '*.changed': 'handleChanged',
            'getProfile.done': 'handleProfile',
            'getProfile.fail': 'handleProfileFail',
            'getOrder.done': 'handleOrder',
            'getOrder.fail': 'handleFail',
            'click .toggle-address': 'toggleAddress',
            'userInfo.done': 'onUserInfoDone',
            'initiate.done': 'login',
            'initiate.fail': 'login',
            'token.done': 'prepareOauth',
            'token.fail': 'prepareOauth',
            'iframe.sendTokens': 'receiveTokens'
        },
        //Magento request data for:
        magentoToken: {
            oauth_token: false,
            oauth_verifier: false,
            oauth_consumer_key: false,
            oauth_nonce: false,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: false,
            oauth_version: '1.0',
            oauth_signature: false
        },
        magentoInitiate: {
            oauth_callback: false,
            oauth_consumer_key: false,
            oauth_nonce: false,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: false,
            oauth_version: '1.0',
            oauth_signature: false
        },
        magentoAuthorize: {
            oauth_token: false,
            oauth_token_secret: false,
        },
        oauth: {
            oauth_token: false,
            oauth_nonce: false,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: false,
            oauth_version: '1.0',
            oauth_signature: false,
            oauth_consumer_key: false
        },
        requests: {
            'getProfile': function (email) {
                return this._getRequest(helpers.fmt(this.resources.PROFILE_URI, this.magentoEndpoint, email), 'GET');
            },
            'initiate': function () {
                return this._getSignedRequest(helpers.fmt(this.resources.INITIATE, this.magentoEndpoint) + "?oauth_callback=" + encodeURIComponent(this.magentoInitiate.oauth_callback), this.magentoInitiate);
            },
            'token': function () {
                return this._getSignedRequest(helpers.fmt(this.resources.TOKEN, this.magentoEndpoint), this.magentoToken);
            },
            'getOrder': function (orderId) {
                return this._getRequest(helpers.fmt(this.resources.ORDER_URI, this.magentoEndpoint, orderId), 'GET');
            },
            'userInfo': {
                url: '/api/v2/users/me.json'
            }
        },
        receiveTokens: function (data) {
            console.info("receiveTokens()");
            if (data !== undefined) {
                this.setMagentoToken(this._getParameterByName(data.location));
                this.ajax('token');
            }
        },
        setMagentoToken: function (tokens) {
            console.info("setMagentoToken()");
            console.log(this.settings);
            this.magentoToken.oauth_token = this.magentoAuthorize.oauth_token;
            this.magentoToken.oauth_verifier = tokens['oauth_verifier'];
            this.magentoToken.oauth_timestamp = this._getTimestamp();
            this.magentoToken.oauth_nonce = this._getNonce();
            this.magentoToken.oauth_consumer_key = this.settings.consumer_key;
            this.magentoToken.oauth_signature = this._generateSignature(encodeURIComponent(helpers.fmt(this.resources.TOKEN, this.magentoEndpoint)), this.magentoToken);
            console.log(this.magentoToken);
        },
        prepareOauth: function (data) {
            if (data.responseText) {
                this.oauth.oauth_token = this._getParameterByName(data.responseText)['oauth_token'];
                this.oauth_token_secret = this._getParameterByName(data.responseText)['oauth_token_secret'];
                this.store('oauth_token_secret', this._getParameterByName(data.responseText)['oauth_token_secret']);
                this.oauth.oauth_consumer_key = this.settings.consumer_key;
                this.store('oauth', this.oauth);
                this.init(this.appCreated);
            }
        },
        oauthLogin: function () {
            if (!this.magentoInitiate.oauth_token) {
                this.magentoInitiate.oauth_timestamp = this._getTimestamp();
                this.magentoInitiate.oauth_callback = this.magentoEndpoint + "/api.html";
                this.magentoInitiate.oauth_nonce = this._getNonce();
                this.magentoInitiate.oauth_consumer_key = this.settings.consumer_key;
                this.magentoInitiate.oauth_signature = this._generateSignature(encodeURIComponent(helpers.fmt(this.resources.INITIATE, this.magentoEndpoint)) + "&" + encodeURIComponent("oauth_callback") + "%3D" + encodeURIComponent(encodeURIComponent(this.magentoInitiate.oauth_callback)), this.magentoInitiate);
            }
        },
        onUserInfoDone: function (data) {
            this.locale = data.user.locale;
        },
        localizeDate: function (date, params) {
            if (!date) {
                return date;
            }
            var dateObj = new Date(date);
            // special fix for safari which does not know about ISO
            if (dateObj.toString() == 'Invalid Date') {
                var parts = date.split(' ');
                var els = parts[0].split('-').concat(parts[1].split(':'));
                dateObj = new Date(els[0], els[1] - 1, els[2], els[3], els[4], els[5]);
            }
            var options = _.extend({
                year: "numeric",
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }, params || {});
            return dateObj.toLocaleDateString(this.locale, options);
        },
        handleChanged: _.debounce(function (e) {
            if (e.propertyName === helpers.fmt("ticket.custom_field_%@", this.settings.order_id_field_id)) {
                this.orderId = e.newValue;
                if (this.profileData) {
                    this._appendTicketOrder();
                } else {
                    this.queryOrder();
                }
            } else if (e.propertyName === "ticket.requester.id") {
                this.queryCustomer();
            }
        }, 500),
        handleProfile: function (data) {
            var ordersLength = 0;

            // Check that the response was successful
            if (_.has(data, 'success') && data.success === false) {
                // Allow failures if there's an order to be fetched
                if (_.isEmpty(this.orderId) === false) {
                    this.queryOrder();
                } else {
                    this.showError(this.I18n.t('global.error.title'), data.message);
                }
                return;
            }

            // We'll do a little transformation on the data and store locally.
            this.profileData = data;
            this.profileData.settings = this.settings;
            this.profileData.addresses = this._cleanupLineBreaks(this.profileData.addresses);

            // See if we should show all orders or only recent orders.
            ordersLength = this.profileData.orders.length;
            if (ordersLength > 3) {
                this.profileData.recentOrders = this.profileData.orders.slice(ordersLength - 3, ordersLength).reverse();
            } else {
                this.profileData.recentOrders = this.profileData.orders.reverse();
            }

            // Got the profile data, populate interface
            this.profileData.created = this.localizeDate(this.profileData.created);
            this.switchTo('profile', this.profileData);

            this._appendTicketOrder();
        },
        handleOrder: function (data) {
            // Check that the response was successfuly
            if (_.isEmpty(data.id)) {
                this.showError(this.I18n.t('global.error.title'), data.message || this.I18n.t('order.error.message'));
                return;
            }

            this.switchTo('order', {order: data});
        },
        handleFail: function () {
            this.showError(this.I18n.t('global.error.title'), this.I18n.t('global.error.server'));
        },
        handleProfileFail: function (resp) {
            if (resp.status === 404) {
                // Allow failures if there's an order to be fetched
                if (_.isEmpty(this.orderId) === false) {
                    this.queryOrder();
                } else {
                    this.showError(this.I18n.t('global.error.title'), this.I18n.t('global.error.noprofile'));
                }
            } else if (resp.status === 401) {
                this.store('oauth', false);
                this.init(this.appCreated);
            } else {
                this.handleFail();
            }
        },
        init: function (data) {
            if (data === undefined) {
                data = this.appCreated;
            } else {
                this.appCreated = data;
            }
            this.ajax('userInfo').done(function () {
                this.magentoEndpoint = this._checkMagentoEndpoint(this.settings.url);

                // Get order id field
                if (this.settings.order_id_field_id) {
                    this.orderId = this.ticket().customField('custom_field_' + this.settings.order_id_field_id);
                }

                if (this.currentLocation() === 'ticket_sidebar') {
                    this.queryCustomer();
                }
            }.bind(this));
        },
        queryCustomer: function () {
            this.switchTo('requesting');
            console.info('storeAuth data');
            console.log(this.store('oauth'));
            if (this.store('oauth')) {
                this.oauth = this.store('oauth');
                this.oauth_token_secret = this.store('oauth_token_secret');
                this.ajax('getProfile', this.ticket().requester().email());
            } else {
                this.oauthLogin();
                this.ajax('initiate', this.ticket().requester().email());
            }
        },
        queryOrder: function () {
            console.info("queryOrder()");
            this.switchTo('requesting');
            this.ajax('getOrder', this.orderId);
        },
        showError: function (title, msg) {
            this.switchTo('error', {
                title: title || this.I18n.t('global.error.title'),
                message: msg || this.I18n.t('global.error.message')
            });
        },
        toggleAddress: function (e) {
            this.$(e.target).parent().next('p').toggleClass('hide');
            return false;
        },
        // Helpers
        _checkMagentoEndpoint: function (url) {
            // First, lets make sure there is no trailing slash, we'll add one later.
            if (url.slice(-1) === '/') {
                url = url.slice(0, -1);
            }
            return url;
        },
        // Format the line breaks for web
        _cleanupLineBreaks: function (toBeCleaned) {
            var cleaned = toBeCleaned;
            _.each(cleaned, function (value, key) {
                cleaned[key] = _.escape(value).replace(/\n/g, '<br>');
            });
            return cleaned;
        },
        _getRequest: function (resource, type) {
            console.info("getRequest()");
            if (type === undefined) {
                type = "POST";
            }

            this.oauth.oauth_nonce = this._getNonce();
            this.oauth.oauth_timestamp = this._getTimestamp();
            this.oauth.oauth_signature = this._generateSignature(encodeURIComponent(resource), this.oauth, type);
            console.log(this.oauth);
            return {
                headers: {
                    'Authorization': this._composeParams(this.oauth),
                    'Content-Type': 'application/json'
                },
                url: resource,
                method: type,
                dataType: 'json'
            };
        },
        _getSignedRequest: function (resource, params, type) {
            if (type === undefined) {
                type = "POST";
            }
            return {
                headers: {
                    'Authorization': this._composeParams(params),
                    'Content-Type': 'application/json'
                },
                url: resource,
                method: type,
                dataType: 'json'
            };
        },
        _appendTicketOrder: function () {
            var orderId = this.orderId,
                    orderTemplate = "";

            // If there is an order ID custom field setup, look to see if the order ID exists in the profile data
            if (orderId) {
                orderTemplate += "<hr />";

                this.profileData.ticketOrder = _.find(this.profileData.orders, function (order) {
                    return (order.id === orderId);
                });

                if (this.profileData.ticketOrder) {
                    this.profileData.ticketOrder.store = this.profileData.ticketOrder.store.replace(/\n/g, '<br>');
                    this.profileData.ticketOrder.created = this.localizeDate(this.profileData.ticketOrder.created);
                    orderTemplate += this.renderTemplate('order', {
                        order: this.profileData.ticketOrder
                    });
                } else {
                    orderTemplate += this.renderTemplate('error', {
                        title: this.I18n.t('global.error.title'),
                        message: this.I18n.t('order.error.message')
                    });
                }
            }

            this.$('.order').html(orderTemplate);
        },
        _composeParams: function (obj) {
            var parts = [];
            for (var i in obj) {
                if (obj.hasOwnProperty(i)) {
                    parts.push(encodeURIComponent(i) + '="' + encodeURIComponent(obj[i]) + '"');
                }
            }
            return 'OAuth ' + parts.join(", ");
        },
        _getOauthToken: function (key, secret) {
            var oauth_token = "";
            return oauth_token;
        },
        _generateSignature: function (encodedUrl, params, type) {
            console.info("generateSignature()");
            //Create Signature Base String using formula
            //var baseSign2 = "POST" + "&" + encodeURIComponent("http://maxmi.modulesgarden-demo.com/oauth/initiate").toString() + "&" + encodeURIComponent("oauth_callback") + "%3D" + encodeURIComponent(encodeURIComponent(this.magentoInitiate.oauth_callback)) + "%26" + encodeURIComponent("oauth_consumer_key") + "%3D" + encodeURIComponent(this.magentoInitiate.oauth_consumer_key) + "%26" + encodeURIComponent("oauth_nonce") + "%3D" + encodeURIComponent(this.magentoInitiate.oauth_nonce) + "%26" + encodeURIComponent("oauth_signature_method") + "%3D" + encodeURIComponent("HMAC-SHA1") + "%26" + encodeURIComponent("oauth_timestamp") + "%3D" + encodeURIComponent(this.magentoInitiate.oauth_timestamp) + "%26" + encodeURIComponent("oauth_version") + "%3D" + encodeURIComponent("1.0");
            if (type === undefined) {
                type = "POST";
            }
            var separator;
            if (params.oauth_callback) {
                separator = "%26";
            } else {
                separator = "&";
            }

            var baseSign = type + "&" + encodedUrl + separator + encodeURIComponent("oauth_consumer_key") + "%3D" + encodeURIComponent(params.oauth_consumer_key) + "%26" + encodeURIComponent("oauth_nonce") + "%3D" + encodeURIComponent(params.oauth_nonce) + "%26" + encodeURIComponent("oauth_signature_method") + "%3D" + encodeURIComponent(params.oauth_signature_method) + "%26" + encodeURIComponent("oauth_timestamp") + "%3D" + encodeURIComponent(params.oauth_timestamp);

            if (params.oauth_token !== undefined) {
                baseSign += "%26" + encodeURIComponent("oauth_token") + "%3D" + encodeURIComponent(params.oauth_token);
            }
            if (params.oauth_verifier !== undefined) {
                baseSign += "%26" + encodeURIComponent("oauth_verifier") + "%3D" + encodeURIComponent(params.oauth_verifier);
            }
            baseSign += "%26" + encodeURIComponent("oauth_version") + "%3D" + encodeURIComponent(params.oauth_version);
            var key = this.settings.consumer_secret + "&";
            if (this.oauth_token_secret) {
                key = key + this.oauth_token_secret;
            }
            var signature = this._b64_hmac_sha1(key, baseSign);
            console.log(key);
            console.log(baseSign);
            console.log(signature);
            return signature;

        },
        _getTimestamp: function () {
            var ts = Math.floor((new Date()).getTime() / 1000);
            return ts;
        },
        _nonce_chars: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        _getNonce: function (length) {
            if (length === undefined) {
                length = 5;
            }
            var result = '',
                    i = 0,
                    rnum,
                    cLength = this._nonce_chars.length;
            for (; i < length; i++) {
                rnum = Math.floor(Math.random() * cLength);
                result += this._nonce_chars.substring(rnum, rnum + 1);
            }
            return result;
        },
        login: function (data) {
            console.info("login()");
            console.log(data);
            this.magentoAuthorize.oauth_token = this._getParameterByName(data.responseText)['oauth_token'];
            this.magentoAuthorize.oauth_token_secret = this._getParameterByName(data.responseText)['oauth_token_secret'];
            this.oauth_token_secret = this._getParameterByName(data.responseText)['oauth_token_secret'];
            this.switchTo('magento', {magentoAuthorize: this.magentoEndpoint + "/" + this.settings.admin_path + "/oauth_authorize?oauth_token=" + this.magentoAuthorize.oauth_token});
        },
        _getParameterByName: function (query) {
            var vars = [], hash;
            var hashes = query.split('&');
            for (var i = 0; i < hashes.length; i++)
            {
                hash = hashes[i].split('=');
                vars.push(hash[0]);
                vars[hash[0]] = hash[1];
            }
            return vars;
        },
        _b64_hmac_sha1: function(k,d,_p,_z) {
        // heavily optimized and compressed version of http://pajhome.org.uk/crypt/md5/sha1.js
        // _p = b64pad, _z = character size; not used here but I left them available just in case
        if (!_p) {_p = '=';}if (!_z) {_z = 8;}function _f(t,b,c,d) {if (t < 20) {return (b & c) | ((~b) & d);}if (t < 40) {return b^c^d;}if (t < 60) {return (b & c) | (b & d) | (c & d);}return b^c^d;}function _k(t) {return (t < 20) ? 1518500249 : (t < 40) ? 1859775393 : (t < 60) ? -1894007588 : -899497514;}function _s(x,y) {var l = (x & 0xFFFF) + (y & 0xFFFF), m = (x >> 16) + (y >> 16) + (l >> 16);return (m << 16) | (l & 0xFFFF);}function _r(n,c) {return (n << c) | (n >>> (32 - c));}function _c(x,l) {x[l >> 5] |= 0x80 << (24 - l % 32);x[((l + 64 >> 9) << 4) + 15] = l;var w = [80], a = 1732584193, b = -271733879, c = -1732584194, d = 271733878, e = -1009589776;for (var i = 0; i < x.length; i += 16) {var o = a, p = b, q = c, r = d, s = e;for (var j = 0; j < 80; j++) {if (j < 16) {w[j] = x[i + j];}else {w[j] = _r(w[j - 3]^w[j - 8]^w[j - 14]^w[j - 16], 1);}var t = _s(_s(_r(a, 5), _f(j, b, c, d)), _s(_s(e, w[j]), _k(j)));e = d;d = c;c = _r(b, 30);b = a;a = t;}a = _s(a, o);b = _s(b, p);c = _s(c, q);d = _s(d, r);e = _s(e, s);}return [a, b, c, d, e];}function _b(s) {var b = [], m = (1 << _z) - 1;for (var i = 0; i < s.length * _z; i += _z) {b[i >> 5] |= (s.charCodeAt(i / 8) & m) << (32 - _z - i % 32);}return b;}function _h(k,d) {var b = _b(k);if (b.length > 16) {b = _c(b, k.length * _z);}var p = [16], o = [16];for (var i = 0; i < 16; i++) {p[i] = b[i]^0x36363636;o[i] = b[i]^0x5C5C5C5C;}var h = _c(p.concat(_b(d)), 512 + d.length * _z);return _c(o.concat(h), 512 + 160);}function _n(b) {var t = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', s = '';for (var i = 0; i < b.length * 4; i += 3) {var r = (((b[i >> 2] >> 8 * (3 - i % 4)) & 0xFF) << 16) | (((b[i + 1 >> 2] >> 8 * (3 - (i + 1) % 4)) & 0xFF) << 8) | ((b[i + 2 >> 2] >> 8 * (3 - (i + 2) % 4)) & 0xFF);for (var j = 0; j < 4; j++) {if (i * 8 + j * 6 > b.length * 32) {s += _p;}else {s += t.charAt((r >> 6 * (3 - j)) & 0x3F);}}}return s;}function _x(k,d) {return _n(_h(k, d));}return _x(k, d);
        }
    };

}());
