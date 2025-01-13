'use strict';
() => {
    console.log("SampleGlobalFunction eval-ed");
    return {
        hello: function (params) {
            console.log("Hello called");
            return "hello";
        },
        sum: function (a, b) {
            console.log("sum called for ", a, " and ", b);
            return a+b;
        }
    }
};
