angular.module('auction').filter('normalize_bidder_label', [function () {
  var REGEXP_SYMBOL_SHARP = /#/g;
  var SYMBOL_NUMBER = '№';

  return function(str) {
    if (typeof str !== 'string') {
      throw new TypeError('Value is not string');
    }

    return str.replace(REGEXP_SYMBOL_SHARP, SYMBOL_NUMBER);
  };
}]);
