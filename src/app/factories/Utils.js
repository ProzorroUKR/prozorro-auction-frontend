angular.module('auction').factory('AuctionUtils', [
  '$filter', '$timeout', '$log', '$window',
  function ($filter, $timeout, $log, $window) {
    // Format msg for timer
    'use strict';

    /**
     * Adds leading zero
     * @param {number} d
     * @returns {string}
     */
    function pad(d) {
      return (d < 10) ? '0' + d.toString() : d.toString();
    }

    function title_timer(time) {
      var DELIMITER_SPACE = ' ';
      var DELIMITER_COLON = ':';
      var NULLABLE_TIME = 0; // with pad

      var titleText = [];

      if (time.days !== NULLABLE_TIME) {
        titleText = titleText.concat([
          pad(time.days),
          DELIMITER_SPACE,
          $filter('translate')('days'),
          DELIMITER_SPACE,
        ]);
      }

      if (time.hours !== NULLABLE_TIME) {
        titleText = titleText.concat([
          pad(time.hours),
          DELIMITER_COLON,
        ]);
      }

      titleText = titleText.concat([
        pad(time.minutes),
        DELIMITER_COLON,
        pad(time.seconds),
      ]);

      return titleText.join('');
    }

    function calculate_server_time(server_time_delta) {
      var date = new Date();
      date.setTime(date.getTime() - server_time_delta);
      return date;
    }

    function prepare_info_timer_data(current_time, auction, bidder_id, Rounds) {
      var i;

      if (auction.current_stage === -101) {
        return {
          'countdown': false,
          'start_time': true,
          'msg': 'Auction has not started and will be rescheduled'
        };
      }

      if (auction.current_stage === -100) {
        return {
          'countdown': false,
          'start_time': true,
          'msg': 'Tender cancelled'
        };
      }

      if (auction.current_stage === -1) {
        var until_seconds = (new Date(auction.stages[0].start) - current_time) / 1000;

        if (until_seconds > -120) {
          return {
            'countdown': (until_seconds) + Math.random(),
            'start_time': false,
            'msg': 'until the auction starts'
          };
        }

        return {
          'countdown': false,
          'start_time': true,
          'msg': 'Auction has not started and will be rescheduled'
        };
      } else {
        if ((auction.stages[auction.current_stage].type || '') === "pre_announcement") {
          var client_time = current_time;
          var ends_time = new Date(auction.stages[auction.current_stage].start);

          if (client_time < ends_time) {
            ends_time = client_time;
          }

          return {
            'countdown': false,
            'start_time': ends_time,
            'msg': 'Auction was completed',
            'msg_ending': 'Waiting for the disclosure of the participants\' names'
          };
        }

        if ((auction.stages[auction.current_stage].type || '') === "announcement") {
          var client_time = current_time;
          var ends_time = new Date(auction.stages[auction.current_stage - 1].start);

          if (client_time < ends_time) {
            ends_time = client_time;
          }

          return {
            'countdown': false,
            'start_time': ends_time,
            'msg': 'Auction was completed'
          };
        }

        if (bidder_id) {
          if (auction.stages[auction.current_stage].bidder_id === bidder_id) {
            return {
              'countdown': ((new Date(auction.stages[auction.current_stage + 1].start) - current_time) / 1000) + Math.random(),
              'start_time': false,
              'msg': 'until your turn ends'
            };
          }

          var all_rounds = Rounds.concat(auction.stages.length - 2);

          for (i in all_rounds) {
            if (auction.current_stage < all_rounds[i]) {
              for (var index = auction.current_stage; index <= all_rounds[i]; index++) {
                if ((auction.stages[index].bidder_id) && (auction.stages[index].bidder_id === bidder_id)) {
                  return {
                    'countdown': ((new Date(auction.stages[index].start) - current_time) / 1000) + Math.random(),
                    'start_time': false,
                    'msg': 'until your turn'
                  };
                }
              }
              break;
            }
          }
        }

        for (i in Rounds) {
          if (auction.current_stage === Rounds[i]) {
            return {
              'countdown': ((new Date(auction.stages[auction.current_stage + 1].start) - current_time) / 1000) + Math.random(),
              'start_time': false,
              'msg': 'until the round starts'
            };
          }

          if (auction.current_stage < Rounds[i]) {
            return {
              'countdown': ((new Date(auction.stages[Rounds[i]].start) - current_time) / 1000) + Math.random(),
              'start_time': false,
              'msg': 'until the round ends'
            };
          }
        }
      }

      return {
        'countdown': ((new Date(auction.stages[auction.stages.length - 2].start) - current_time) / 1000) + Math.random(),
        'start_time': false,
        'msg': 'until the results announcement'
      };
    }

    function prepare_progress_timer_data(current_time, auction) {

      if (
        (auction.current_stage &&
          ((auction.stages[auction.current_stage] || {}).type || '').indexOf('announcement') !== -1)
        || (auction.current_stage === -100) || (auction.current_stage === -101)
      ) {
        return {
          'countdown_seconds': false,
          'rounds_seconds': 0,
        };
      }
      if (auction.current_stage === -1) {
        var until_seconds = (new Date(auction.stages[0].start) - current_time) / 1000;
        if (until_seconds > -120) {
          return {
            'countdown_seconds': until_seconds + Math.random(),
            'rounds_seconds': until_seconds,
          };
        } else {
          return {
            'countdown_seconds': false,
            'rounds_seconds': 0,
          };
        }
      }
      return {
        'countdown_seconds': ((new Date(auction.stages[auction.current_stage + 1].start) - current_time) / 1000) + Math.random(),
        'rounds_seconds': ((new Date(auction.stages[auction.current_stage + 1].start) - new Date(auction.stages[auction.current_stage].start)) / 1000),
      };

    }

    // characters 100 true
    function prepare_title_ending_data(auction, lang) {
      var ending = auction.tenderID + " - " + $filter('characters')((auction['title_' + lang] || auction['title'] || auction['title_en'] || auction['title_ru'] || ""), 50, true);
      ending += " - ";
      ending += $filter('characters')(auction.procuringEntity['name_' + lang] || auction.procuringEntity['name'] || auction.procuringEntity['name_en'] || auction.procuringEntity['name_ru'] || "", 50, true);
      return ending;
    }

    // Get bidder_id from query
    function get_bidder_id() {
      var query = window.location.search.substring(1);
      var vars = query.split('&');
      for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) === 'bidder_id') {
          return decodeURIComponent(pair[1]);
        }
      }
    }

    // Format date with traslations
    function format_date(date, lang, format) {
      var temp_date = moment(date).locale(lang);
      if (typeof temp_date.format === 'function') {
        return temp_date.format(format);
      }
      return "";
    }

    // Get round data
    function get_round_data(pause_index, auction_doc, Rounds) {
      if (pause_index === -1) {
        return {
          'type': 'waiting'
        };
      }
      if (pause_index <= Rounds[0]) {
        return {
          'type': 'pause',
          'data': ['', '1',]
        };
      }
      for (var i in Rounds) {
        if (pause_index < Rounds[i]) {
          return {
            'type': 'round',
            'data': parseInt(i)
          };
        } else if (pause_index === Rounds[i]) {
          return {
            'type': 'pause',
            'data': [(parseInt(i)).toString(), (parseInt(i) + 1).toString(),]
          };
        }
      }

      if (pause_index < (auction_doc.stages.length - 1)) {
        return {
          'type': 'round',
          'data': Rounds.length
        };
      } else {
        return {
          'type': 'finish'
        };
      }
    }

    // Scroll functionality
    function scroll_to_stage(auction_doc, Rounds) {
      $timeout(function () {
        var current_round = 0;
        for (var index in Rounds) {
          if ((auction_doc.current_stage >= Rounds[index]) && (auction_doc.current_stage <= (Rounds[index] + auction_doc.initial_bids.length))) {
            current_round = parseInt(index) + 1;
            break;
          }
        }
        if (auction_doc.current_stage >= 0) {
          if (current_round) {
            var scroll_tag_id = 'round-header-' + current_round.toString();
            var round_elem = document.getElementById(scroll_tag_id);
          } else {
            var scroll_tag_id = 'results-header'
            var round_elem = document.getElementById(scroll_tag_id);
          }
          ;
        }
        if (round_elem) {
          var round_elem_dimensions = round_elem.getBoundingClientRect();
          if (($window.innerHeight - 169) < round_elem_dimensions.height) {
            if (current_round) {
              var scroll_tag_id = 'stage-' + auction_doc.current_stage.toString();
            } else {
              var scroll_tag_id = 'results-header';
            }
            var stage_elem = document.getElementById(scroll_tag_id);
            if (stage_elem) {
              stage_elem.scrollIntoView(true);
              var stage_elem_dimensions = stage_elem.getBoundingClientRect();
              $window.scrollBy(0, stage_elem_dimensions.top - 96);
            }
          } else {
            round_elem.scrollIntoView(true);
            var round_elem_dimensions = document.getElementById(scroll_tag_id).getBoundingClientRect()
            $window.scrollBy(0, round_elem_dimensions.top - 96);
          }
        }
      }, 0);
    }

    function detectIE() {
      var ua = window.navigator.userAgent;

      var msie = ua.indexOf('MSIE ');
      if (msie > 0) {
        return parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
      }

      var trident = ua.indexOf('Trident/');
      if (trident > 0) {
        var rv = ua.indexOf('rv:');
        return parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
      }

      var edge = ua.indexOf('Edge/');
      if (edge > 0) {
        return parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
      }

      return false;
    }

    function parseQueryString(str) {
      if (typeof str !== 'string') {
        return {};
      }

      str = str.trim().replace(/^(\?|#)/, '');

      if (!str) {
        return {};
      }

      return str.trim().split('&').reduce(function (ret, param) {
        var parts = param.replace(/\+/g, ' ').split('=');
        var key = parts[0];
        var val = parts[1];
        key = decodeURIComponent(key);
        val = val === undefined ? null : decodeURIComponent(val);
        if (!ret.hasOwnProperty(key)) {
          ret[key] = val;
        } else if (Array.isArray(ret[key])) {
          ret[key].push(val);
        } else {
          ret[key] = [ret[key], val];
        }
        return ret;
      }, {});
    }

    function stringifyQueryString(obj) {
      return obj ? Object.keys(obj).map(function (key) {
        var val = obj[key];
        if (Array.isArray(val)) {
          return val.map(function (val2) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(val2);
          }).join('&');
        }
        return encodeURIComponent(key) + '=' + encodeURIComponent(val);
      }).join('&') : '';
    }

    function inIframe() {
      try {
        return window.self !== window.top;
      } catch (e) {
        return true;
      }
    }

    /**
     * @param {number} centerX
     * @param {number} centerY
     * @param {number} radius
     * @param {number} angleInDegrees
     * @returns {{x: number, y: number}}
     */
    function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
      var angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;

      return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
      };
    }

    function generateUUID() {
      var d = new Date().getTime();
      var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      return uuid;
    }

    function UnsupportedBrowser() {
      var parser = new UAParser();
      var Browser = parser.getBrowser();
      if (Browser.name === "Opera") {
        if (parseFloat(Browser.version) < 12.10) {
          return true
        }
      }
      if (Browser.name === "IE") {
        if (parseFloat(Browser.major) < 10) {
          return true
        }
      }
      if (Browser.name === "Opera Mini") {
        return true
      }
      return false;
    }

    function npv(contract_duration_years, contract_duration_days,
                 yearly_payments_percentage, annual_costs_reduction,
                 announcement_date, nbu_discount_rate,
                 days_per_year, npv_calculation_duration) {
      // Setup default parameters days per year and calculation duration
      days_per_year = (typeof days_per_year !== 'undefined') ? days_per_year : 365;
      npv_calculation_duration = (typeof npv_calculation_duration !== 'undefined') ? npv_calculation_duration : 20;

      // Calculate discount rate days

      announcement_date = new Date(announcement_date);
      var first_year_days = Math.floor(
        ((new Date(announcement_date.getFullYear(), 11, 31) -
          new Date(announcement_date.getFullYear(), announcement_date.getMonth(), announcement_date.getDate())) /
          1000) / 86400); // calculate whole days
      var days_for_discount_rate = [first_year_days].concat(Array.apply(null, Array(npv_calculation_duration - 1)).map(function () {
        return days_per_year;
      }));
      days_for_discount_rate.push(days_per_year - first_year_days);

      // Calculate days with payments

      var contract_duration = contract_duration_years * days_per_year + contract_duration_days;
      var first_period_duration = math.min(contract_duration, days_for_discount_rate[0]);
      var full_periods_count = Math.floor((contract_duration - first_period_duration) / days_per_year);
      var last_period_duration = (contract_duration - first_period_duration) % days_per_year;


      var empty_periods_count = npv_calculation_duration + 1 - full_periods_count - 2;
      var days_with_payments = [first_period_duration].concat(Array.apply(null, Array(full_periods_count)).map(function () {
        return days_per_year;
      }));
      days_with_payments.push(last_period_duration);
      days_with_payments = days_with_payments.concat(Array.apply(null, Array(empty_periods_count)).map(function () {
        return 0;
      }));

      // Calculate payments

      var payments = [];
      for (var i = 0; i < annual_costs_reduction.length; i++) {
        if (days_with_payments[i] === 0) {
          payments.push(math.fraction(0));
        } else {
          payments.push(
            math.fraction(
              math.multiply(
                math.multiply(
                  math.fraction(yearly_payments_percentage),
                  math.fraction(annual_costs_reduction[i])
                ),
                math.fraction(days_with_payments[i], days_for_discount_rate[i])))
          );
        }

      }

      // Calculate income
      var income;
      if (days_for_discount_rate[0] === 0)
        income = [math.fraction(0)];
      else
        income = [math.subtract(math.fraction(String(annual_costs_reduction[0])), payments[0])];
      for (var i = 1; i < annual_costs_reduction.length; i++) {
        income.push(math.fraction(
          math.subtract(
            math.multiply(
              math.fraction(String(annual_costs_reduction[i])),
              math.fraction(days_for_discount_rate[i], 365)
            ),
            math.fraction(payments[i]))));
      }

      // Calculate discount rate

      var disc_rates = [];
      for (var i = 0; i < days_for_discount_rate.length; i++) {
        disc_rates.push(
          math.multiply(
            math.fraction(String(nbu_discount_rate)),
            math.fraction(days_for_discount_rate[i], days_per_year)
          )
        );
      }

      // Calculate discounted_income

      var discounted_income_by_periods = [];
      var coefficient = 1;
      for (var i = 0; i < disc_rates.length; i++) {
        var discRatePlusOneFraction = math.fraction(math.add(disc_rates[i].n, disc_rates[i].d), disc_rates[i].d);
        if (coefficient == 1) {
          coefficient = math.fraction(discRatePlusOneFraction.d, discRatePlusOneFraction.n);
        } else {
          coefficient = math.fraction(
            math.multiply(coefficient.n, discRatePlusOneFraction.d),
            math.multiply(coefficient.d, discRatePlusOneFraction.n)
          );
        }
        discounted_income_by_periods.push(math.multiply(coefficient, income[i]));
      }

      // return sum of discounted income
      return math.sum(discounted_income_by_periods.map(
        function (x) {
          return math.divide(math.bignumber(x.n), math.bignumber(x.d));
        }
      )).toFixed(11);
    }

    return {
      'prepare_info_timer_data': prepare_info_timer_data,
      'prepare_progress_timer_data': prepare_progress_timer_data,
      'title_timer': title_timer,
      'get_bidder_id': get_bidder_id,
      'format_date': format_date,
      'get_round_data': get_round_data,
      'scroll_to_stage': scroll_to_stage,
      'parseQueryString': parseQueryString,
      'stringifyQueryString': stringifyQueryString,
      'prepare_title_ending_data': prepare_title_ending_data,
      'pad': pad,
      'inIframe': inIframe,
      'polarToCartesian': polarToCartesian,
      'generateUUID': generateUUID,
      'detectIE': detectIE,
      'UnsupportedBrowser': UnsupportedBrowser,
      'npv': npv,
      'calculate_server_time': calculate_server_time
    };
  }]);
