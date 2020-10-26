angular.module('auction').directive('svgTimer',[
    function(){
      return {
        templateNamespace: 'svg',
        template: `
            <g>
              <circle cx="24" cy="24" r="21"  stroke="#494949" stroke-width="5" fill="#DBDBDB" />
              <line x1="24" y1="24" ng-attr-x2="{{minutes_line.x}}" ng-attr-y2="{{minutes_line.y}}" stroke="#15293d" style="stroke-width:2" />
              <line x1="24" y1="24" ng-attr-x2="{{seconds_line.x}}" ng-attr-y2="{{seconds_line.y}}" stroke="#88bda4" style="stroke-width:1" />
              <line x1="24" y1="24" ng-attr-x2="{{hours_line.x}}" ng-attr-y2="{{hours_line.y}}" stroke="#26374a" style="stroke-width:2" />
              <path ng-attr-d="{{arc_params}}" fill="#a5a5a5" />
              <circle cx="24" cy="24" r="2.5" stroke="white" stroke-width="1.5" fill="192B3F" />
            </g>
        `,
        restrict: 'E',
        replace: true
      };
}])
