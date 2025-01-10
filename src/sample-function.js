'use strict';
() => {
    console.log("SampleGlobalFunction eval-ed");
    return {
        hello: function (params) {
            console.log("Hello called");
            return "hello";
        }
    }
};
