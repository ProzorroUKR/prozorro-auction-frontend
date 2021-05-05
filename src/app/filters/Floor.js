angular.module('auction').filter('floor', [function () {
  return function (value, precision) {
    precision = precision || 0;

    var format_function = function (val) {
      var formatted = math.format(Number(val), {
        notation: 'fixed',
        precision: precision
      });
      var parts = formatted.split(".");
      parts[0] = parts[0].replace(/(\d)(?=(\d{3})+$)/g, '$1 ');
      return parts.join(",");
    };

    if (!angular.isUndefined(value) && value !== "") {
      if (!angular.isNumber(value)) {
        value = math.eval(math.format(math.fraction(value)));
      }
      value = Number(Math.floor(
        Number(value + 'e' + precision)
      ) + 'e-' + precision);
      return format_function(value);
    }
    return "";
  };
}]);
