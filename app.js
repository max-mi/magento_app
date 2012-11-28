(function() {

	'use_strict';

	return {

		defaultState: 'loading',

		initialised: false,

		profileData: {},

		magentoApiEndpoint: '',

		resources: {
			PROFILE_URI       : '%@/index.php/zendesk/api/customers/%@'
		},

		requests: {
			'getProfile'   : function(email) { return this._getRequest(helpers.fmt(this.resources.PROFILE_URI, this.magentoApiEndpoint, email)); }
		},

		events: {
			'app.activated'                  : 'init',
			'ticket.requester.email.changed' : 'queryMagento',
			'getProfile.done'                : 'handleGetProfile',
			'getProfile.fail'                : 'handleFail',
			'click .toggle-address'          : 'toggleAddress'
		},

		requiredTicketProperties: [
			'ticket.requester.email'
		],

		init: function(data){
			if(!data.firstLoad){
				return;
			}

			// We're ready to do layout & ask for data
			this.switchTo('waiting');
			var that = this;
			_.delay(function(){
				if(that.requiredTicketPropertiesReady()){
					that.queryMagento();
				}
			}, 100);
		},

		requiredTicketPropertiesReady: function(){
			// Loop through requiredTicketProperties and work out if they are ready
			return true;
		},

		queryMagento: function(){
			this.switchTo('requesting');
			this.ajax('getProfile', this.ticket().requester().email());
		},

		dataChanged: function(data) {
			var requester = this.ticket().requester();
			if (_.isUndefined(requester)) { return; }
			var email = requester.email();
			if (_.isUndefined(email)) { return; }
			if (this.magentoApiEndpoint === '') { this.magentoApiEndpoint = this._checkMagentoApiEndpoint(this.settings.url); }
		},

		handleGetProfile: function(data) {
			var ordersLength = 0,
          i;

			// Check that the response was successfuly
			if (_.has(data, 'success') && data.success === false)
			{
				this.showError(this.I18n.t('global.error.title'), data.message);
				return;
			}

			// We'll do a little transformation on the data and store locally.
			this.profileData = data;
			this.profileData.settings = this.settings;
			this.profileData.addresses = this._cleanupLineBreaks(this.profileData.addresses);

			// See if we should show all orders or only recent orders.
			ordersLength = this.profileData.orders.length;
			if ( ordersLength > 3 ) {
				this.profileData.recentOrders = this.profileData.orders.slice(ordersLength-3, ordersLength).reverse();
			} else {
				this.profileData.recentOrders = this.profileData.orders.reverse();
			}

			this._orderToShow();

			// Got the profile data, populate interface
			this.switchTo('profile', this.profileData);
		},

		handleFail: function() {
			// Show fail message
			this.showError();
		},

		_getRequest: function(resource) {
			return {
				headers  : {
					'Authorization': 'Token token="'+this.settings.access_token+'"'
				},
				url      : resource,
				method   : 'GET',
				dataType : 'json'
			};
		},

		_checkMagentoApiEndpoint: function(url) {
			// First, lets make sure there is no trailing slash, we'll add one later.
			if (url.slice(-1) === '/') { url = url.slice(0, -1); }
			// Test whether we have a front-controller reference here.
			if (url.indexOf('index.php') === -1)
			{
				// Nothing to do, the front-controller isn't in the url, pass it back unaltered.
				return url;
			}
			url = url.replace(/\/index.php/g, '');
			return url;
		},

		showError: function(title, msg) {
			this.switchTo('error', {
				title: title || this.I18n.t('global.error.title'),
				message: msg || this.I18n.t('global.error.message')
			});
		},

		toggleAddress: function (e) {
			this.$(e.target).parent().next('p').toggleClass('hide');
			return false;
		},

		// Look to see if we should show a specific order's details
		_orderToShow: function(){
			var orderId, customFieldName, order;

			// If there is an order ID custom field setup
			if ( this.settings.order_id_field_id ) {
				// Look to see if the order ID exists in the profile data
				customFieldName = 'custom_field_' + this.settings.order_id_field_id;
				orderId = this.ticket().customField(customFieldName);

				if (orderId) {
					this.profileData.ticketOrder = _.find(this.profileData.orders, function(order){
						return (order.id === orderId);
					});

					if (!_.isUndefined(this.profileData.ticketOrder)) {
						this.profileData.ticketOrder.store = this.profileData.ticketOrder.store.replace(/\n/g, '<br>');
					}
				}

			}
		},

		// Format the line breaks for web
		_cleanupLineBreaks: function(toBeCleaned) {
			var cleaned = toBeCleaned;
			_.each(cleaned, function(value, key) {
				cleaned[key] = value.replace(/\n/g, '<br>');
			});
			return cleaned;
		}


	};

}());