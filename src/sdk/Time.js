/**
 * Copyright 2016 PhenixP2P Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
define('sdk/Time', [ ], function () {
    'use strict';

    function Time() {
        this._version = version;
        this._baseUri = baseUri;
    }

    Time.now = function () {
        if (!Date.now) {
            return function () {
                return new Date().getTime();
            }
        }

        return function () {
            return Date.now();
        }
    }();

    return Time;
});