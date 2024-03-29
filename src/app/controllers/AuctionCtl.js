angular.module('auction').controller('AuctionController', [
  'AuctionConfig', 'AuctionUtils',
  '$timeout', '$interval', '$http', '$log', '$cookies', '$window',
  '$rootScope', '$location', '$translate', '$filter', 'growl', 'growlMessages', '$aside', '$q',
  function (AuctionConfig, AuctionUtils,
            $timeout, $interval, $http, $log, $cookies, $window,
            $rootScope, $location, $translate, $filter, growl, growlMessages, $aside, $q) {
    /**
     * @type {Object.<LanguageKey, LocaleKey>}
     */
    var localesMap = {
      uk: 'uk_UA',
      ru: 'ru_RU',
      en: 'en_US',
    };

    /**
     * @param {LanguageKey} langKey
     */
    var setDocumentLang = function (langKey) {
      var element = document.querySelector('[http-equiv="Content-Language"]');
      if (element) {
        document.documentElement.lang = langKey;
        element.setAttribute('content', localesMap[langKey]);
      }
    }

    if (AuctionUtils.inIframe() && 'localhost' !== location.hostname) {
      $log.error('Starts in iframe');
      window.open(location.href, '_blank');
      return false;
    }

    AuctionConfig.auction_doc_id = window.location.pathname.replace('/tenders/', '');

    if ($cookies.get('client_id') === undefined) {
      $cookies.put('client_id', AuctionUtils.generateUUID());
    }

    $rootScope.lang = 'uk';
    $rootScope.normilized = false;
    $rootScope.format_date = AuctionUtils.format_date;
    $rootScope.bidder_id = null;
    $rootScope.bid = null;
    $rootScope.allow_bidding = true;
    $rootScope.form = {};
    $rootScope.alerts = [];
    $rootScope.default_http_error_timeout = 500;
    $rootScope.query_params = AuctionUtils.parseQueryString(location.search);
    $rootScope.http_error_timeout = $rootScope.default_http_error_timeout;
    $rootScope.client_id = $cookies.get('client_id');
    $rootScope.browser_client_id = AuctionUtils.generateUUID();

    window.onunload = function () {
      $log.info("Close window");
    }

    if (AuctionConfig.auction_doc_id.indexOf("_") > 0) {
      var doc_id_parts = AuctionConfig.auction_doc_id.split("_")
      $log.context["TENDER_ID"] = doc_id_parts[0];
      $log.context["LOT_ID"] = doc_id_parts[1];
    } else {
      $log.context["TENDER_ID"] = AuctionConfig.auction_doc_id;
    }

    $log.info({
      message: "Start session",
      client_id: $rootScope.client_id,
      browser_client_id: $rootScope.browser_client_id,
      user_agent: navigator.userAgent
    })

    $rootScope.change_view = function () {
      if ($rootScope.bidder_coeficient) {
        $rootScope.normilized = !$rootScope.normilized;
      }
    };
    $rootScope.growlMessages = growlMessages;
    growlMessages.initDirective(0, 10);
    if (($translate.storage().get($translate.storageKey()) === "undefined") || ($translate.storage().get($translate.storageKey()) === undefined)) {
      $translate.use(AuctionConfig.default_lang);
      $rootScope.lang = AuctionConfig.default_lang;
    } else {
      $rootScope.lang = $translate.storage().get($translate.storageKey()) || $rootScope.lang;
    }

    setDocumentLang($rootScope.lang);

    /*      Time stopped events    */
    $rootScope.$on('timer-stopped', function (event) {
      if (($rootScope.auction_doc) && (event.targetScope.timerid === 1) && ($rootScope.auction_doc.current_stage === -1)) {
        if (!$rootScope.auction_not_started) {
          $rootScope.auction_not_started = $timeout(function () {
            if ($rootScope.auction_doc.current_stage === -1) {
              var msg = 'Please wait for the auction start.';
              growl.warning(msg, {ttl: 120000, disableCountDown: true});
              $log.info({message: msg});
            }
          }, 10000);
        }

        $timeout(function () {
          if ($rootScope.auction_doc.current_stage === -1) {
            $rootScope.sync_times_with_server();
          }
        }, 120000);
      }
    });
    /*      Time tick events    */
    $rootScope.$on('timer-tick', function (event) {
      const date = AuctionUtils.calculate_server_time($rootScope.last_sync_delta);

      if ($rootScope.auction_doc && event.targetScope.timerid === 1) {
        const infoTimer = $rootScope.info_timer || {};
        const isUntilYourTurn = (infoTimer.msg || '') === 'until your turn';

        if (isUntilYourTurn && event.targetScope.minutes === 1 && event.targetScope.seconds === 50) {
          $rootScope.check_authorization();
        }

        $timeout(function () {
          $rootScope.time_in_title = AuctionUtils.title_timer(event.targetScope);
        }, 0);

        return;
      }

      $rootScope.seconds_line = AuctionUtils.polarToCartesian(24, 24, 16, (date.getSeconds() / 60) * 360);
      $rootScope.minutes_line = AuctionUtils.polarToCartesian(24, 24, 16, (date.getMinutes() / 60) * 360);
      $rootScope.hours_line = AuctionUtils.polarToCartesian(24, 24, 14, (date.getHours() / 12) * 360);
    });

    /**
     * @param {LanguageKey} langKey
     */
    $rootScope.changeLanguage = function (langKey) {
      $translate.use(langKey);
      $rootScope.lang = langKey;
      setDocumentLang(langKey);
    };

    // Bidding form msgs
    $rootScope.closeAlert = function (msg_id) {
      for (var i = 0; i < $rootScope.alerts.length; i++) {
        if ($rootScope.alerts[i].msg_id === msg_id) {
          $rootScope.alerts.splice(i, 1);
          return true;
        }
      }
    };
    $rootScope.auto_close_alert = function (msg_id) {
      $timeout(function () {
        $rootScope.closeAlert(msg_id);
      }, 4000);
    };
    $rootScope.get_round_number = function (pause_index) {
      return AuctionUtils.get_round_data(pause_index, $rootScope.auction_doc, $rootScope.Rounds);
    };
    $rootScope.show_bids_form = function (argument) {
      if (
        (angular.isNumber($rootScope.auction_doc.current_stage)) &&
        ($rootScope.auction_doc.current_stage >= 0) &&
        ($rootScope.auction_doc.stages[$rootScope.auction_doc.current_stage].type === 'bids') &&
        ($rootScope.auction_doc.stages[$rootScope.auction_doc.current_stage].bidder_id === $rootScope.bidder_id)
      ) {
        $log.info({message: "Allow view bid form"});
        $rootScope.max_bid_amount();
        $rootScope.view_bids_form = true;
        if ($rootScope.is_esco) { // TypeError: Cannot read property '$valid' of undefined
          $timeout(function () {
            $rootScope.calculate_current_npv();
          }, 100);
        }
      } else {
        $rootScope.view_bids_form = false;
      }
      return $rootScope.view_bids_form;
    };

    $rootScope.sync_times_with_server = function () {
      $http.get('/get_current_server_time', {
        'params': {
          '_nonce': Math.random().toString()
        }
      }).then(function (data) {
        var date_server = new Date(data.headers().date);
        $rootScope.last_sync_delta = new Date() - date_server;

        $rootScope.update_info_timer(date_server, true);
        $rootScope.update_progress_timer(date_server, true);

        if ($rootScope.auction_doc.current_stage === -1) {
          if ($rootScope.progress_timer.countdown_seconds < 900) {
              $rootScope.start_changes();
          } else {
            $timeout(function () {
              $rootScope.start_changes();
              $rootScope.follow_login = true;
            }, ($rootScope.progress_timer.countdown_seconds - 900) * 1000);
          }
        } else {
          $rootScope.start_changes();
        }
      }, function () {
        $log.error("Error while getting server time");
      });
    };

    $rootScope.start_changes = function () {
      if (!$rootScope.start_changes_feed) {
        $rootScope.correct_times_with_server_last_sync();
        $rootScope.check_system_time();
      }
      $rootScope.start_changes_feed = true;
    }

    $rootScope.correct_times_with_server_last_sync = function () {
      var sync_delay = 10 * 1000;
      if (angular.isDefined($rootScope.auction_doc)) {
        if ($rootScope.last_sync_delta) {
          var date = AuctionUtils.calculate_server_time($rootScope.last_sync_delta);
          $rootScope.update_info_timer(date);
          $rootScope.update_progress_timer(date);
        }

        if ($rootScope.auction_doc.current_stage !== ($rootScope.auction_doc.stages.length - 1)) {
          $timeout($rootScope.correct_times_with_server_last_sync, sync_delay);
        }
      } else {
        $timeout($rootScope.correct_times_with_server_last_sync, sync_delay);
      }
    }

    $rootScope.check_system_time = function () {
      var check_delay = 1000;
      if (angular.isDefined($rootScope.auction_doc)) {
        var old_time = $rootScope.check_system_time.old_time || new Date(),
          new_time = new Date(),
          time_diff = new_time - old_time,
          max_time_diff = 5 * 1000;

        $rootScope.check_system_time.old_time = new_time;

        if (Math.abs(time_diff) >= max_time_diff) {
          $rootScope.sync_times_with_server();
        }

        if ($rootScope.auction_doc.current_stage !== ($rootScope.auction_doc.stages.length - 1)) {
          $timeout($rootScope.check_system_time, check_delay);
        }
      } else {
        $timeout($rootScope.check_system_time, check_delay);
      }
    }

    $rootScope.update_info_timer = function (date, reset) {
      var info_timer = AuctionUtils.prepare_info_timer_data(
        date, $rootScope.auction_doc, $rootScope.bidder_id, $rootScope.Rounds,
      );
      if (angular.isUndefined($rootScope.info_timer) || reset) {
        $rootScope.info_timer = info_timer;
      } else {
        $rootScope.info_timer.countdown = info_timer.countdown;
      }

      $log.debug({
        message: "Info timer data:",
        info_timer: $rootScope.info_timer,
      });
    }

    $rootScope.update_progress_timer = function (date, reset) {
      var progress_timer = AuctionUtils.prepare_progress_timer_data(
        date, $rootScope.auction_doc,
      );
      if (angular.isUndefined($rootScope.progress_timer) || reset) {
        $rootScope.progress_timer = progress_timer;
      } else {
        $rootScope.progress_timer.countdown_seconds = progress_timer.countdown_seconds;
      }

      $log.debug({
        message: "Progress timer data:",
        progress_timer: $rootScope.progress_timer
      });
    }

    $rootScope.warning_post_bid = function () {
      growl.error('Unable to place a bid. Check that no more than 2 auctions are simultaneously opened in your browser.');
    };

    $rootScope.request_failed_warning = null;
    $rootScope.show_failed_request_warning = function () {
      if (!$rootScope.request_failed_warning) {
        $rootScope.request_failed_warning = growl.error(
          "Your post bid request still hasn't succeed. Check (or change) your internet connection, browser or device.",
          {ttl: -1, disableCountDown: true}
        );
      }
    };
    $rootScope.request_failed_warning_timeout = null;
    $rootScope.schedule_failed_request_warning = function () {
      if (!$rootScope.request_failed_warning_timeout) {
        $rootScope.request_failed_warning_timeout = $timeout($rootScope.show_failed_request_warning, 5000);
      }
    };
    $rootScope.remove_failed_request_warning = function () {
      if ($rootScope.request_failed_warning) {
        $rootScope.growlMessages.deleteMessage(
          $rootScope.request_failed_warning
        );
        delete $rootScope.request_failed_warning;
      }
      if ($rootScope.request_failed_warning_timeout) {
        $timeout.cancel($rootScope.request_failed_warning_timeout);
        delete $rootScope.request_failed_warning_timeout;
      }
    };

    var too_low_bid_msg_id = "too_low_bid_msg_id";
    $rootScope.show_too_low_bid_warning = function (value) {
      var prev_value = 0;

      if (angular.isObject($rootScope.auction_doc)) {
        var current_stage_obj = $rootScope.auction_doc.stages[$rootScope.auction_doc.current_stage];
        if (angular.isObject(current_stage_obj) && (current_stage_obj.amount || current_stage_obj.amount_features)) {
          if ($rootScope.is_meat) {
            if ($rootScope.bidder_coeficient) {
              prev_value = math.fraction(current_stage_obj.amount_features) * $rootScope.bidder_coeficient;
            }
          } else if ($rootScope.is_lcc) {
            if ($rootScope.bidder_non_price_cost) {
              prev_value = math.fraction(current_stage_obj.amount_weighted) - $rootScope.bidder_non_price_cost;
            }
          } else if ($rootScope.is_mixed) {
            prev_value = math.fraction(current_stage_obj.amount_weighted)
            if ($rootScope.bidder_addition) {
              prev_value = prev_value - $rootScope.bidder_addition;
            }
            if ($rootScope.bidder_denominator) {
               prev_value = prev_value * $rootScope.bidder_denominator;
            }
          } else {
            prev_value = math.fraction(current_stage_obj.amount);
          }
        }
      }

      var too_low_bid_ratio = prev_value !== 0 ? (100 - value / prev_value * 100).toFixed(2) : NaN;

      $log.info({message: 'Bid may be decrease by ' + too_low_bid_ratio + '%'});

      $rootScope.alerts.push({
        type: 'danger',
        msg: 'You are going to decrease your bid by {{too_low_bid_ratio}}%. Are you sure?',
        msg_vars: {too_low_bid_ratio: too_low_bid_ratio},
      });
    }
    $rootScope.prevent_sending_too_low_bid = function (value) {
      var ratio = 1 - value / $rootScope.calculated_max_bid_amount;
      if (
        $rootScope.calculated_max_bid_amount == null || value == null || value === -1
        || ratio < 0.3
        || $rootScope.force_post_low_bid === value
      ) {
        $rootScope.force_post_low_bid = undefined;
        $rootScope.closeAlert(too_low_bid_msg_id);
        return false;
      } else {
        $rootScope.force_post_low_bid = value;
        $rootScope.show_too_low_bid_warning(value);
        return true;
      }
    };

    // esco TODO check if it's used somewhere
    $rootScope.calculate_yearly_payments = function (annual_costs_reduction, yearlyPaymentsPercentage) {
      return math.fraction(annual_costs_reduction) * math.fraction(yearlyPaymentsPercentage);
    };
    $rootScope.calculate_current_npv = function () {
      var contractDurationYears = $rootScope.form.contractDurationYears || 0,
        contractDurationDays = $rootScope.form.contractDurationDays || 0,
        yearlyPaymentsPercentage = $rootScope.form.yearlyPaymentsPercentage || 0;
      if ($rootScope.form.BidsForm.$valid) {
        $rootScope.current_npv = AuctionUtils.npv(
          parseInt(contractDurationYears.toFixed()),
          parseInt(contractDurationDays.toFixed()),
          parseFloat((yearlyPaymentsPercentage / 100).toFixed(5)),
          $rootScope.get_annual_costs_reduction($rootScope.bidder_id),
          $rootScope.auction_doc.noticePublicationDate,
          $rootScope.auction_doc.NBUdiscountRate
        );
      } else {
        $rootScope.current_npv = 0;
      }
    };
    // -- esco

    $rootScope.post_bid = function (firstArg, secondArgs, thirdArg) {
      if ($rootScope.is_esco) {
        var contractDurationYears = firstArg || $rootScope.form.contractDurationYears || 0;
        var contractDurationDays = secondArgs || $rootScope.form.contractDurationDays || 0;
        var yearlyPaymentsPercentage = thirdArg || $rootScope.form.yearlyPaymentsPercentage || 0;
        var bid_data = {
          contractDuration: parseInt(contractDurationYears.toFixed()),
          contractDurationDays: parseInt(contractDurationDays.toFixed()),
          yearlyPaymentsPercentage: yearlyPaymentsPercentage === -1 ? yearlyPaymentsPercentage : parseFloat((yearlyPaymentsPercentage / 100).toFixed(5))
        };
      } else {
        bid_data = {amount: parseFloat(firstArg) || parseFloat($rootScope.form.bid) || 0};
      }
      $log.info({
        message: "Start post bid",
        bid_data: JSON.stringify(bid_data)
      });

      if ($rootScope.form.BidsForm.$valid) {
        $rootScope.alerts = [];
        if ($rootScope.is_esco) {
          var bid_amount = AuctionUtils.npv(
            parseInt(contractDurationYears.toFixed()),
            parseInt(contractDurationDays.toFixed()),
            parseFloat(yearlyPaymentsPercentage.toFixed(3)),
            $rootScope.get_annual_costs_reduction($rootScope.bidder_id),
            $rootScope.auction_doc.noticePublicationDate,
            $rootScope.auction_doc.NBUdiscountRate
          );
          var is_cancellation = yearlyPaymentsPercentage === -1;
        } else {
          bid_amount = bid_data.amount;
          if ($rootScope.prevent_sending_too_low_bid(bid_amount)) {
            return 0;
          }
          is_cancellation = bid_data.amount === -1
        }
        if (bid_amount === $rootScope.minimal_bid.amount) {
          $rootScope.alerts.push({
            msg_id: Math.random(),
            type: 'warning',
            msg: 'The proposal you have submitted coincides with a proposal of the other participant. ' +
              'His proposal will be considered first, since it has been submitted earlier.'
          });
        }
        $rootScope.form.active = true;
        $timeout(function () {
          $rootScope.form.active = false;
        }, 5000);
        if (!$rootScope.post_bid_timeout) {
          $rootScope.post_bid_timeout = $timeout($rootScope.warning_post_bid, 10000);
        }
        $rootScope.schedule_failed_request_warning();

        $http.post(
          "/api/auctions/" + AuctionConfig.auction_doc_id + "/bids/" + ($rootScope.bidder_id || bidder_id) +
          "?hash=" + $rootScope.query_params.hash,
          bid_data
        ).then(function (success) {
          $rootScope.remove_failed_request_warning();
          if ($rootScope.post_bid_timeout) {
            $timeout.cancel($rootScope.post_bid_timeout);
            delete $rootScope.post_bid_timeout;
          }
          $rootScope.form.active = false;

          var msg_id = Math.random();
          if (is_cancellation) {
            $rootScope.alerts = [];
            $rootScope.allow_bidding = true;
            $log.info({
              message: "Handle cancel bid response on post bid"
            });
            $rootScope.alerts.push({
              msg_id: msg_id,
              type: 'success',
              msg: 'Bid canceled'
            });
            $log.info({
              message: "Handle cancel bid response on post bid"
            });
            if ($rootScope.is_esco) {
              var npv = AuctionUtils.npv(
                success.data.contractDurationYears,
                success.data.contractDurationDays,
                success.data.yearlyPaymentsPercentage,
                $rootScope.get_annual_costs_reduction($rootScope.bidder_id),
                $rootScope.auction_doc.noticePublicationDate,
                $rootScope.auction_doc.NBUdiscountRate
              );
              $rootScope.current_npv = npv;
              $rootScope.form.contractDurationYears = success.data.contractDurationYears;
              $rootScope.form.contractDurationDays = success.data.contractDurationDays;
              $rootScope.form.yearlyPaymentsPercentage = success.data.yearlyPaymentsPercentage * 100;
            } else {
              $rootScope.form.bid = "";
              $rootScope.form.full_price = '';
            }
          } else {
            $log.info({
              message: "Handle success response on post bid",
              bid_data: JSON.stringify(bid_data)
            });
            $rootScope.alerts.push({
              msg_id: msg_id,
              type: 'success',
              msg: 'Bid placed'
            });
            $rootScope.allow_bidding = false;
          }
          $rootScope.auto_close_alert(msg_id);

        }, function (error) {
          $log.info({
            message: "Handle error on post bid",
            bid_data: error.status
          });
          if ($rootScope.post_bid_timeout) {
            $timeout.cancel($rootScope.post_bid_timeout);
            delete $rootScope.post_bid_timeout;
          }
          if (error.status === 400) {
            $rootScope.remove_failed_request_warning();
            var msg_id = Math.random();
            $rootScope.alerts.push({
              msg_id: msg_id,
              type: 'danger',
              msg: error.data.error
            });
            $log.info({
              message: "Handle failed response on post bid",
              bid_data: error.data.error
            });
            $rootScope.auto_close_alert(msg_id);

          } else if (error.status === 401) {
            $rootScope.remove_failed_request_warning();
            $rootScope.alerts.push({
              msg_id: Math.random(),
              type: 'danger',
              msg: 'Ability to submit bids has been lost. Use the valid participation link to enter the auction.'
            });
            $log.error({
              message: "Ability to submit bids has been lost."
            });
          } else {
            $log.error({
              message: "Unhandled Error while post bid",
              error_data: error.data
            });
            $timeout($rootScope.post_bid, 2000);
          }
        });
      }
    };
    $rootScope.edit_bid = function () {
      $rootScope.allow_bidding = true;
    };
    $rootScope.max_bid_amount = function () {
      var amount = 0;

      if ((angular.isString($rootScope.bidder_id)) && (angular.isObject($rootScope.auction_doc))) {
        var current_stage_obj = $rootScope.auction_doc.stages[$rootScope.auction_doc.current_stage] || null;
        if (angular.isObject(current_stage_obj) && (
          current_stage_obj.amount || current_stage_obj.amount_features || current_stage_obj.amount_weighted
        )) {
          if ($rootScope.bidder_coeficient && $rootScope.is_meat) {

            if ($rootScope.is_esco) {
              amount = math.fraction(current_stage_obj.amount_features) * (
                $rootScope.bidder_coeficient + math.fraction($rootScope.auction_doc.minimalStepPercentage)
              );
            } else {
              amount = (
                math.fraction(current_stage_obj.amount_features) * $rootScope.bidder_coeficient
              ) - math.fraction($rootScope.auction_doc.minimalStep.amount);
            }

          } else if ($rootScope.bidder_non_price_cost && $rootScope.is_lcc) {

            if ($rootScope.is_esco) {
              amount = 0;
            } else {
              amount = (
                math.fraction(current_stage_obj.amount_weighted) - $rootScope.bidder_non_price_cost
              ) - math.fraction($rootScope.auction_doc.minimalStep.amount);
            }

          } else if (($rootScope.bidder_addition || $rootScope.bidder_denominator) && $rootScope.is_mixed) {
            if ($rootScope.is_esco) {
              amount = 0;
            } else {
              amount = (
                  (math.fraction(current_stage_obj.amount_weighted) - $rootScope.bidder_addition) * $rootScope.bidder_denominator
              ) - math.fraction($rootScope.auction_doc.minimalStep.amount);
            }
          } else {

            if ($rootScope.is_esco) {
              amount = math.fraction(current_stage_obj.amount) * (
                1 + math.fraction($rootScope.auction_doc.minimalStepPercentage)
              );
            } else {
              amount = math.fraction(current_stage_obj.amount) - math.fraction($rootScope.auction_doc.minimalStep.amount);
            }

          }
        }
      }
      if (amount < 0) {
        $rootScope.calculated_max_bid_amount = 0;
        return 0;
      }
      $rootScope.calculated_max_bid_amount = amount;
      return amount;
    };
    $rootScope.calculate_minimal_bid_amount = function () {
      if ((angular.isObject($rootScope.auction_doc)) && (angular.isArray($rootScope.auction_doc.stages)) && (angular.isArray($rootScope.auction_doc.initial_bids))) {
        var bids = [];
        var sort_by;

        if ($rootScope.is_meat) {
          sort_by = 'amount_features';
        } else if ($rootScope.is_lcc) {
          sort_by = 'amount_weighted';
        } else if ($rootScope.is_mixed) {
          sort_by = 'amount_weighted';
        } else {
          sort_by = 'amount';
        }
        var filter_func = function (item, index) {
          if (!angular.isUndefined(item[sort_by])) {
            bids.push(item);
          }
        };
        $rootScope.auction_doc.stages.forEach(filter_func);
        $rootScope.auction_doc.initial_bids.forEach(filter_func);
        if ($rootScope.is_esco) {
          $rootScope.minimal_bid = bids.sort(function (a, b) {
            var diff;
            if ($rootScope.is_meat) {
              diff = math.fraction(math.eval(a.amount_features)) - math.fraction(math.eval(b.amount_features));
            } else if ($rootScope.is_lcc) {
              diff = math.fraction(math.eval(a.amount_weighted)) - math.fraction(math.eval(b.amount_weighted));
            } else if ($rootScope.is_mixed) {
              diff = math.fraction(math.eval(a.amount_weighted)) - math.fraction(math.eval(b.amount_weighted));
            } else {
              diff = math.eval(a.amount) - math.eval(b.amount);
            }
            if (diff === 0) {
              return Date.parse(a.time || "") - Date.parse(b.time || "");
            }
            return diff;
          }).reverse()[0];

        } else {
          $rootScope.minimal_bid = bids.sort(function (a, b) {
            if ($rootScope.is_meat) {
              var diff = math.fraction(a.amount_features) - math.fraction(b.amount_features);
            } else if ($rootScope.is_lcc) {
              var diff = math.fraction(a.amount_weighted) - math.fraction(b.amount_weighted);
            } else if ($rootScope.is_mixed) {
              var diff = math.fraction(a.amount_weighted) - math.fraction(b.amount_weighted)
            } else {
              var diff = a.amount - b.amount;
            }
            if (diff === 0) {
              return Date.parse(a.time || "") - Date.parse(b.time || "");
            }
            return diff;
          })[0];
        }
      }
    };

    // MAIN
    $rootScope.main = function (init) {
      $rootScope.check_authorization(
        function () {
          $rootScope.get_db_document(true);
        }
      );
    };
    $rootScope.get_db_document = function (init) {
      $http.get(
        '/api/auctions/' + AuctionConfig.auction_doc_id,
        {
          'params': {
            '_nonce': Math.random().toString()
          }
        }
      ).then(
        function (response) {
          var doc = response.data;
          if (init) {
            $rootScope.http_error_timeout = $rootScope.default_http_error_timeout;
            $rootScope.title_ending = AuctionUtils.prepare_title_ending_data(doc, $rootScope.lang);
            if (AuctionUtils.UnsupportedBrowser()) {
              $timeout(function () {
                $rootScope.unsupported_browser = true;
                growl.error(
                  $filter('translate')('Your browser is out of date, and this site may not work properly.') +
                  '<a style="color: rgb(234, 4, 4); text-decoration: underline;" href="http://browser-update.org/uk/update.html">' +
                  $filter('translate')('Learn how to update your browser.') + '</a>',
                  {
                    ttl: -1,
                    disableCountDown: true
                  }
                );
              }, 500);
            }
            $rootScope.is_esco = doc.procurementMethodType === 'esco';
            $rootScope.procurement_criteria = $rootScope.is_esco ? 'maximum' : 'minimum';

            $rootScope.auction_type = doc.auction_type || 'default'
            $rootScope.is_default = $rootScope.auction_type === 'default';
            $rootScope.is_mixed = $rootScope.auction_type === 'mixed';
            $rootScope.is_meat = $rootScope.auction_type === 'meat';
            $rootScope.is_lcc = $rootScope.auction_type === 'lcc';

            $rootScope.replace_document(doc);

            if ($rootScope.auction_doc.current_stage === ($rootScope.auction_doc.stages.length - 1)) {
              $log.info({
                message: 'Auction ends already'
              });
            } else {
              $rootScope.start_sync();
            }
          } else {
            $rootScope.replace_document(doc);
          }
          $rootScope.restart_retries = AuctionConfig.restart_retries;
          $rootScope.document_exists = true;
          // $timeout($rootScope.get_db_document, 2000);  // sync changes
        },
        function (response) {
          if (response.status === 404) {
            $log.error({message: 'Not Found Error', error_data: response});
            $rootScope.document_not_found = true;
          } else {
            $log.error({message: 'Changes Server Error', error_data: response});
            $rootScope.http_error_timeout = $rootScope.http_error_timeout * 2;
            $timeout(
              function () {
                $rootScope.get_db_document(init)
              },
              $rootScope.http_error_timeout
            );
            if ($rootScope.restart_retries < 1) {
              growl.error('Synchronization failed');
              $log.error({message: 'Synchronization failed'});

            } else if ($rootScope.restart_retries !== AuctionConfig.restart_retries) {
              growl.warning('Internet connection is lost. Attempt to restart after 1 sec', {
                ttl: 1000
              });
            }
            $rootScope.restart_retries -= 1;
          }
        }
      );
    };
    $rootScope.start_sync = function () {
      var schema = window.location.protocol === "https:" ? "wss:" : "ws:";
      var relative_path = '/api/auctions/' + AuctionConfig.auction_doc_id + '/ws'
      var uri = schema + "//" + window.location.host + relative_path;

      // Create WebSocket connection.
      var socket = new WebSocket(uri),
        heartbeat_delay = 5000,
        heartbeat_timeout = null,
        heartbeats_missed = 0;

      socket.onopen = function (event) {
        if (heartbeat_timeout === null) {
          heartbeat_timeout = $timeout(function heartbeat() {
            var check_heartbeats_missed = function () {
              if (heartbeats_missed >= 3) {
                throw new Error("Too many missed heartbeats.");
              }
            }
            try {
              heartbeats_missed++;
              check_heartbeats_missed();
              socket.send("PONG");
              heartbeat_timeout = $timeout(heartbeat, heartbeat_delay);
            } catch (e) {
              heartbeat_timeout = null;
              console.warn("Closing connection. Reason: " + e.message);
              socket.close(1000, "Closing unhealthy connection");
            }
          }, heartbeat_delay);
        }
      };

      socket.onmessage = function (event) {
        if (event.data === "PING") {
          heartbeats_missed = 0; // reset the counter for missed heartbeats
          return;
        }
        var json = JSON.parse(event.data);
        $rootScope.replace_document(json);
        $rootScope.restart_retries = AuctionConfig.restart_retries;
      };

      socket.onerror = function (error) {
        console.error(error);
      };

      socket.onclose = function () {
        console.log("Close handler. Restart after a second");
        $timeout(function () {
          $rootScope.start_sync();
        }, 1000);

        if ($rootScope.restart_retries < 1) {
          growl.error('Synchronization failed', {ttl: 2000});
          $log.error({message: 'Synchronization failed'});

        } else if ($rootScope.restart_retries !== AuctionConfig.restart_retries) {
          growl.warning('Internet connection is lost. Attempt to restart after 1 sec', {
            ttl: 1000
          });
        }
        $rootScope.restart_retries -= 1;
      };
    };
    $rootScope.check_authorization = function (on_finish) {
      on_finish = on_finish || function () {
      };

      var start_anonymous_session = function () {
        $timeout(function () {  // doesn't work without timeout
          growl.info($filter('translate')('You are an observer and cannot bid.'), {
            ttl: -1,
            disableCountDown: true
          });
        }, 1000);
        $log.info({message: 'Start anonymous session'});
      };

      if ($rootScope.query_params.bidder_id && $rootScope.query_params.hash) {
        $log.info({
          message: 'Start private session'
        });
        var data = {
          bidder_id: $rootScope.query_params.bidder_id,
          hash: $rootScope.query_params.hash,
          client_id: $rootScope.client_id
        };
        $http.post(
          '/api/auctions/' + AuctionConfig.auction_doc_id + '/check_authorization',
          data
        ).then(
          function (response) {
            $rootScope.bidder_id = $rootScope.query_params.bidder_id;
            $rootScope.return_url = $rootScope.query_params.return_url;
            $log.context["BIDDER_ID"] = $rootScope.bidder_id;
            $log.info({
              message: "Authorization checked"
            });
            if ('coeficient' in response.data) {
              $rootScope.bidder_coeficient = math.fraction(response.data.coeficient);
              $log.info({message: "Get coeficient " + $rootScope.bidder_coeficient});
            }
            if ('non_price_cost' in response.data) {
              $rootScope.bidder_non_price_cost = math.fraction(response.data.non_price_cost);
              $log.info({message: "Get non_price_cost " + $rootScope.bidder_non_price_cost});
            }
            if ('addition' in response.data) {
              $rootScope.bidder_addition = math.fraction(response.data.addition)
              $log.info({message: "Get addition " + $rootScope.bidder_addition})
            }
            if ('denominator' in response.data) {
              $rootScope.bidder_denominator = math.fraction(response.data.denominator)
              $log.info({message: "Get denominator: " + $rootScope.bidder_denominator})
            }
            if (response.data.amount) {
              $rootScope.form.bid = response.data.amount;
              $rootScope.allow_bidding = false;
              $log.info({message: "RestoreBidAmount " + $rootScope.form.bid});
            } else if (response.data.yearlyPaymentsPercentage) {  // esco
              $rootScope.form.contractDurationYears = response.data.contractDurationYears;
              $rootScope.form.contractDurationDays = response.data.contractDurationDays;
              $rootScope.form.yearlyPaymentsPercentage = response.data.yearlyPaymentsPercentage * 100;
              if (response.data.changed) {  // show edit form
                $rootScope.allow_bidding = false;
              }
            }
            on_finish();
          },
          function (response) {
            if (response.status === 401 || response.status === 400) {
              $log.info({
                message: "Authorization failed: " + response.data
              });
              start_anonymous_session();
            } else {
              $log.info({
                message: "Authorization exception: " + response.status + " " + response.data
              });
              $timeout($rootScope.check_authorization, 1000);
            }
            on_finish();
          }
        );
      } else {
        start_anonymous_session();
        on_finish();
      }
    };
    $rootScope.replace_document = function (new_doc) {
      if ($rootScope.auction_doc && $rootScope.auction_doc.modified === new_doc.modified) return;

      if ((angular.isUndefined($rootScope.auction_doc)) || (new_doc.current_stage - $rootScope.auction_doc.current_stage === 0) || (new_doc.current_stage === -1)) {
        if (angular.isUndefined($rootScope.auction_doc)) {
          $log.info({
            message: 'Change current_stage',
            current_stage: new_doc.current_stage,
            stages: (new_doc.stages || []).length - 1
          });
        }
      } else {
        $log.info({
          message: 'Change current_stage',
          current_stage: new_doc.current_stage,
          stages: (new_doc.stages || []).length - 1
        });
        $rootScope.allow_bidding = true;
      }
      $rootScope.auction_doc = new_doc;
      $rootScope.sync_times_with_server();
      $rootScope.calculate_rounds();
      $rootScope.calculate_minimal_bid_amount();
      $rootScope.scroll_to_stage();
      $rootScope.show_bids_form();
      if (!$rootScope.$$phase) {
        $rootScope.$apply();
      }
    };
    $rootScope.calculate_rounds = function (argument) {
      $rootScope.Rounds = [];
      $rootScope.auction_doc.stages.forEach(function (item, index) {
        if (item.type === 'pause') {
          $rootScope.Rounds.push(index);
        }
      });
    };
    $rootScope.scroll_to_stage = function () {
      AuctionUtils.scroll_to_stage($rootScope.auction_doc, $rootScope.Rounds);
    };
    $rootScope.array = function (int) {
      return new Array(int);
    };
    $rootScope.open_menu = function () {
      var modalInstance = $aside.open({
        templateUrl: 'templates/menu.html',
        size: 'lg',
        backdrop: true
      });
    };
    /* 2-WAY INPUT */
    $rootScope.calculate_bid_temp = function () {
      var new_full_price;
      if (angular.isDefined($rootScope.form.bid)) {
        var form_bid = Number(math.fraction(($rootScope.form.bid * 100).toFixed(), 100));
        if ($rootScope.is_meat) {
          new_full_price = form_bid / $rootScope.bidder_coeficient;
        } else if ($rootScope.is_lcc) {
          new_full_price = form_bid + $rootScope.bidder_non_price_cost;
        } else if ($rootScope.is_mixed) {
          new_full_price = (form_bid / $rootScope.bidder_denominator) + $rootScope.bidder_addition;
        }

      }
      $rootScope.form.full_price = new_full_price;
    };
    $rootScope.get_annual_costs_reduction = function (bidder_id) {  // esco
      var initial_bids = $rootScope.auction_doc.initial_bids;
      for (var initial_bid in initial_bids) {
        if (initial_bids.hasOwnProperty(initial_bid)) {
          if (bidder_id === initial_bids[initial_bid].bidder_id) {
            return initial_bids[initial_bid].annualCostsReduction;
          }
        }
      }
    };
    $rootScope.calculate_full_price_temp = function () {
      if ($rootScope.is_esco) {
        if ($rootScope.form.BidsForm.$valid) {
          var bid = AuctionUtils.npv($rootScope.form.contractDurationYears,
            $rootScope.form.contractDurationDays,
            parseFloat(($rootScope.form.yearlyPaymentsPercentage / 100).toFixed(5)),
            $rootScope.get_annual_costs_reduction($rootScope.bidder_id),
            $rootScope.auction_doc.noticePublicationDate,
            $rootScope.auction_doc.NBUdiscountRate
          );
        } else {
          bid = 0;
        }
        $rootScope.form.full_price_temp = bid * $rootScope.bidder_coeficient;
        $rootScope.form.full_price = $rootScope.form.full_price_temp;
      } else {
        var new_form_bid;
        if (angular.isDefined($rootScope.form.full_price)) {
          if ($rootScope.is_meat) {
            new_form_bid = (math.fix((
              math.fraction($rootScope.form.full_price) * $rootScope.bidder_coeficient
            ) * 100)) / 100;
          } else if ($rootScope.is_lcc) {
            new_form_bid = (math.fix((
              math.fraction($rootScope.form.full_price) - $rootScope.bidder_non_price_cost
            ) * 100)) / 100;
          } else if ($rootScope.is_mixed) {
            new_form_bid = (math.fix((
                math.fraction(($rootScope.form.full_price - $rootScope.bidder_addition) * $rootScope.bidder_denominator)
            ) * 100 )) / 100;
          }
        }
        $rootScope.form.bid = new_form_bid;
      }
    };
    /* Inits */
    $rootScope.init_stage_info = function (stage_obj) {
      var current_stage = $rootScope.auction_doc.current_stage,
        is_current_bidder = stage_obj.bidder_id === $rootScope.bidder_id,
        is_finished = current_stage === ($rootScope.auction_doc.stages.length - 1),
        amount = stage_obj.amount_features || stage_obj.amount_weighted || stage_obj.amount,
        minimal_amount = $rootScope.minimal_bid.amount_features || $rootScope.minimal_bid.amount_weighted || $rootScope.minimal_bid.amount,
        is_amount = (angular.isUndefined(stage_obj.type) || stage_obj.type === 'bids') && !angular.isUndefined(amount),
        is_minimal = (amount === minimal_amount) && stage_obj.time === $rootScope.minimal_bid.time,
        bidder_label = stage_obj.label,
        is_changed = stage_obj.changed;

      return {
        amount: stage_obj.amount,
        amount_features: stage_obj.amount_features,
        amount_weighted: stage_obj.amount_weighted,
        denominator: stage_obj.denominator,
        addition: stage_obj.addition,
        coeficient: stage_obj.coeficient,
        non_price_cost: stage_obj.non_price_cost,
        is_current_bidder: is_current_bidder,
        is_finished: is_finished,
        is_amount: is_amount,
        is_minimal: is_minimal,
        is_changed: is_changed,
        bidder_label: bidder_label
      }
    };
    $rootScope.main();
  }]);
