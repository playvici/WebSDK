/**
 * Copyright 2018 PhenixP2P Inc. All Rights Reserved.
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
/* global requirejs */
if (window.BUILD_ENV === 'webpack') {
    require("bootstrap/dist/css/bootstrap.css");
    require("animate.css/animate.css");
    require("./get-user-media.css");
} else {
    requirejs.config({
        paths: {
            'phenix-web-sdk': 'web-sdk',
            'phenix-rtc': 'phenix-rtc/dist/phenix-rtc-bundled',
            'jquery': 'jquery/dist/jquery.min',
            'lodash': 'lodash/lodash.min',
            'bootstrap': 'bootstrap/dist/js/bootstrap.min',
            'bootstrap-notify': 'bootstrap-notify/bootstrap-notify.min',
            'fingerprintjs2': 'fingerprintjs2/dist/fingerprint2.min',
            'shaka-player': 'shaka-player/dist/shaka-player.compiled',
            'video-player': 'player',
            'app-setup': 'app-setup',
            'phenix-web-lodash-light': 'phenix-web-lodash-light/dist/phenix-web-lodash-light.min',
            'phenix-web-assert': 'phenix-web-assert/dist/phenix-web-assert.min',
            'phenix-web-http': 'phenix-web-http/dist/phenix-web-http.min',
            'phenix-web-logging': 'phenix-web-logging/dist/phenix-web-logging.min',
            'phenix-web-observable': 'phenix-web-observable/dist/phenix-web-observable.min',
            'phenix-web-reconnecting-websocket': 'phenix-web-reconnecting-websocket/dist/phenix-web-reconnecting-websocket.min',
            'phenix-web-network-connection-monitor': 'phenix-web-network-connection-monitor/dist/phenix-web-network-connection-monitor.min',
            'phenix-web-proto': 'phenix-web-proto/dist/phenix-web-proto.min',
            'phenix-web-event': 'phenix-web-event/dist/phenix-web-event.min',
            'phenix-web-disposable': 'phenix-web-disposable/dist/phenix-web-disposable.min',
            'phenix-web-closest-endpoint-resolver': 'phenix-web-closest-endpoint-resolver/dist/phenix-web-closest-endpoint-resolver.min',
            'phenix-web-player': 'phenix-web-player/dist/phenix-web-player-bundled.min',
            'phenix-web-application-activity-detector': 'phenix-web-application-activity-detector/dist/phenix-web-application-activity-detector.min'
        }
    });
}

requirejs([
    'jquery',
    'lodash',
    'bootstrap-notify',
    'fingerprintjs2',
    'phenix-web-sdk',
    'shaka-player',
    'video-player',
    'app-setup'
], function($, _, bootstrapNotify, Fingerprint, sdk, shaka, Player, app) {
    var init = function init() {
        var fingerprint = new Fingerprint();
        var localPrimaryPlayer = null;
        var localSecondaryPlayer = null;
        var primaryPlayer = null;
        var secondaryPlayer = null;
        var userMediaStream = null;

        if (app.getUrlParameter('streamId')) {
            $('#stream').append($('<option></option>').attr('value', app.getUrlParameter('streamId')).attr('selected', 'selected').text(app.getUrlParameter('streamId')));
            $('#originStreamId').val(app.getUrlParameter('streamId'));
        }

        if (app.isMobile()) {
            var frontOption = document.createElement('option');
            var backOption = document.createElement('option');

            frontOption.value = 'user';
            frontOption.innerHTML = 'Front Facing Camera';
            backOption.value = 'environment';
            backOption.innerHTML = 'Back Camera';

            $('#gum-source')[0].append(frontOption);
            $('#gum-source')[0].append(backOption);
        }

        var adminBaseUri;
        var pcast;
        var shakaErrorCategories = {
            1: 'Network',
            2: 'Text',
            3: 'Media',
            4: 'Manifest',
            5: 'Streaming',
            6: 'DRM',
            7: 'Player',
            8: 'Cast',
            9: 'Storage'
        };

        var createPCast = function createPCast() {
            window.onerror = function(e) {
                pcast.getLogger().error('Window Error', e);
            };

            if (pcast) {
                pcast.stop();
            }

            var uri = app.getUri();
            var pcastOptions = {
                uri: uri,
                shaka: app.getUrlParameter('shaka') ? shaka : null
            };

            adminBaseUri = app.getBaseUri();

            if (app.getUrlParameter('ssmr')) {
                pcastOptions.streamingSourceMapping = {
                    patternToReplace: app.getUrlParameter('ssmp') || app.getDefaultReplaceUrl(),
                    replacement: app.getUrlParameter('ssmr')
                };
            }

            fingerprint.get(function(fingerprint) {
                pcastOptions.deviceId = fingerprint;
                pcast = new sdk.PCast(pcastOptions);

                pcast.getLogger().addAppender({
                    log: function() {
                        if (sdk.RTC.browser !== 'Safari') {
                            return;
                        }

                        $.ajax({
                            url: '/log',
                            accepts: 'application/json',
                            contentType: 'application/json',
                            method: 'POST',
                            data: JSON.stringify({messages: arguments})
                        });
                    }
                });

                app.setLoggerUserId(pcast);
                app.setLoggerEnvironment(pcast);
                app.setLoggerVersion(pcast);
            });
        };

        var createAuthToken = function createAuthToken() {
            var data = app.getAuthData();

            $.ajax({
                url: adminBaseUri + '/pcast/auth',
                accepts: 'application/json',
                contentType: 'application/json',
                method: 'POST',
                data: JSON.stringify(data)
            }).done(function(result) {
                $('.authToken').val(result.authenticationToken);
                app.activateStep('step-2');
                setTimeout(function() {
                    app.activateStep('step-3');
                }, 1500);
            }).fail(function(jqXHR, textStatus, errorThrown) {
                app.createNotification('danger', {
                    icon: 'glyphicon glyphicon-remove-sign',
                    title: '<strong>Auth</strong>',
                    message: 'Failed to create authentication token (' + (errorThrown || jqXHR.status) + ')'
                });
            });
        };

        var start = function start() {
            pcast.start($('#authToken').val(), function authenticateCallback(pcast, status, sessionId) {
                $('#stop').removeClass('disabled');
                $('.sessionId').val(sessionId);
            }, function onlineCallback() {
                app.createNotification('success', {
                    icon: 'glyphicon glyphicon-log-in',
                    title: '<strong>Online</strong>',
                    message: 'Connected to PCast&trade;'
                });
                app.activateStep('step-4');
                setTimeout(function() {
                    app.activateStep('step-5');
                }, 1500);
            }, function offlineCallback() {
                app.createNotification('warning', {
                    icon: 'glyphicon glyphicon-log-out',
                    title: '<strong>Offline</strong>',
                    message: 'Disconnected from PCast&trade;'
                });
            });
        };

        var stop = function stop() {
            pcast.stop();
            $('.sessionId').val('');
            $('#stop').addClass('disabled');
        };

        var getUserMedia = function getUserMedia() {
            var userMediaCallback = function userMediaCallback(error, response) {
                if (error) {
                    app.createNotification('danger', {
                        icon: 'glyphicon glyphicon-facetime-video',
                        title: '<strong>User Media</strong>',
                        message: 'Failed to get user media (' + error + ')'
                    });
                    $('#userMediaInfo').text('Failed: ' + error.message);

                    return;
                }

                console.log('Got user media stream');
                app.createNotification('info', {
                    icon: 'glyphicon glyphicon-facetime-video',
                    title: '<strong>User Media</strong>',
                    message: 'Acquired user media stream with options (' + response.options.frameRate + '|' + response.options.aspectRatio + '|' + response.options.resolution + ')'
                });

                stopUserMedia();

                userMediaStream = response.userMedia;
                $('#stopUserMedia').removeClass('disabled');

                $('#userMediaInfo').html('User Media Stream is running with ' + response.userMedia.getTracks().length + ' tracks');
                app.activateStep('step-5-2');

                var primaryStream = window.MediaStream ? new window.MediaStream() : userMediaStream;
                var secondaryStream = window.MediaStream ? new window.MediaStream() : null;

                if (window.MediaStream) {
                    _.forEach(userMediaStream.getTracks(), function(track) {
                        var trackCount = _.filter(primaryStream.getTracks(), function(primaryStreamTrack) {
                            return primaryStreamTrack.kind === track.kind;
                        }).length;

                        if (trackCount === 1) {
                            return secondaryStream.addTrack(track);
                        }

                        return primaryStream.addTrack(track);
                    });
                }

                localPrimaryPlayer = new Player('localVideo', {
                    maxWidth: 160,
                    maxHeight: 120
                });

                localPrimaryPlayer.start(primaryStream);

                if (secondaryStream.getTracks().length > 0) {
                    localSecondaryPlayer = new Player('localVideoSecondary', {
                        maxWidth: 160,
                        maxHeight: 120
                    });

                    localSecondaryPlayer.start(secondaryStream);
                }
            };

            if (!userMediaStream || userMediaStream.ended) {
                var source = $('#gum-source option:selected').val();
                var quality = $('#gum-quality option:selected').val();
                var framerate = $('#gum-framerate option:selected').val();
                var aspectRatio = $('#gum-aspect-ratio option:selected').val();
                var userMediaResolver = new sdk.UserMediaResolver(pcast, {
                    aspectRatio: aspectRatio,
                    resolutionHeight: parseInt(quality),
                    frameRate: parseInt(framerate)
                });
                var deviceOptions = {
                    screen: _.includes(source.toLowerCase(), 'screen'),
                    audio: _.includes(source.toLowerCase(), 'microphone'),
                    video: _.includes(source.toLowerCase(), 'camera'),
                    screenAudio: _.includes(source.toLowerCase(), 'screenaudio')
                };

                if (_.includes(source.toLowerCase(), 'application')) {
                    deviceOptions.screen = {mediaSource: 'application'};
                }

                if (_.includes(source.toLowerCase(), 'desktop')) {
                    deviceOptions.screen = {mediaSource: 'screen'};
                }

                if (source === 'user' || source === 'environment') {
                    deviceOptions = {video: {facingMode: source}};
                }

                userMediaResolver.getUserMedia(deviceOptions, userMediaCallback);
            }
        };

        var stopUserMedia = function() {
            if (userMediaStream) {
                var tracks = userMediaStream.getTracks();

                for (var i = 0; i < tracks.length; i++) {
                    tracks[i].stop();
                }

                userMediaStream = null;

                $('#stopUserMedia').addClass('disabled');
            }

            if (localPrimaryPlayer) {
                localPrimaryPlayer.stop();
            }

            if (localSecondaryPlayer) {
                localSecondaryPlayer.stop();
            }
        };

        var publisher;

        var publish = function publish() {
            if (!userMediaStream) {
                app.createNotification('danger', {
                    icon: 'glyphicon glyphicon-facetime-video',
                    title: '<strong>User Media</strong>',
                    message: 'Please acquire the user media before publishing'
                });

                return;
            }

            var streamToken = $('#streamTokenForPublishing').val();

            if (!streamToken) {
                app.createNotification('danger', {
                    icon: 'glyphicon glyphicon-facetime-video',
                    title: '<strong>Stream Token</strong>',
                    message: 'Please create a stream token before publishing'
                });

                return;
            }

            var tags = ['my-stream-id'];

            var publishCallback = function publishCallback(pcast, status, phenixPublisher) {
                if (status !== 'ok') {
                    app.createNotification('danger', {
                        icon: 'glyphicon glyphicon-remove-sign',
                        title: '<strong>Publish</strong>',
                        message: 'Failed to publish stream (' + status + ')'
                    });

                    return;
                }

                stopPublisher();

                publisher = phenixPublisher;
                $('#stopPublisher').removeClass('disabled');

                publisher.setDataQualityChangedCallback(function(publisher, status, reason) {
                    app.createNotification('info', {
                        icon: 'glyphicon glyphicon-film',
                        title: '<strong>Publish</strong>',
                        message: 'Data quality update: sending ' + status + ' with limitation ' + reason
                    });
                });

                publisher.setPublisherEndedCallback(function(publisher, reason) {
                    app.createNotification('info', {
                        icon: 'glyphicon glyphicon-film',
                        title: '<strong>Publish</strong>',
                        message: 'The published stream ended for reason "' + reason + '"'
                    });
                });
                publisher.monitor({}, function() {
                    app.createNotification('danger', {
                        icon: 'glyphicon glyphicon-remove-sign',
                        title: '<strong>Publish</strong>',
                        message: 'Monitor condition'
                    });
                });

                var limit = publisher.limitBandwidth(400000);

                setTimeout(function() {
                    if (limit) {
                        limit.dispose();
                    }
                }, 10000);

                app.createNotification('success', {
                    icon: 'glyphicon glyphicon-film',
                    title: '<strong>Publish</strong>',
                    message: 'Started publishing stream "' + publisher.getStreamId() + '"'
                });

                $('.streamIdForPublishing').val(publisher.getStreamId());
                $('#originStreamId').val(publisher.getStreamId());
                app.activateStep('step-5-5');
                setTimeout(function() {
                    app.activateStep('step-6');
                }, 1500);
            };

            pcast.publish(streamToken, userMediaStream, publishCallback, tags);
        };

        var stopPublisher = function() {
            if (publisher) {
                publisher.stop();
                publisher = null;
                $('#stopPublisher').addClass('disabled');
                $('.streamIdForPublishing').val('');
            }
        };

        var onStreamSelected = function onStreamSelected() {
            var streamId = $('#stream option:selected').text();

            if (streamId) {
                $('#originStreamId').val(streamId);
                app.activateStep('step-6');
            }
        };

        var listStreams = function listStreams() {
            var applicationId = $('#applicationId').val();
            var secret = $('#secret').val();

            if (applicationId === '' || secret === '') {
                return;
            }

            var data = {
                applicationId: applicationId,
                secret: secret,
                length: 256,
                options: ['global']
            };

            $.ajax({
                url: adminBaseUri + '/pcast/streams',
                accepts: 'application/json',
                contentType: 'application/json',
                method: 'PUT',
                data: JSON.stringify(data)
            }).done(function(result) {
                $('#stream').find('option').remove().end();

                if (result.streams.length > 0) {
                    $('#stream').append($('<option></option>').attr('value', '').text('Please select a stream'));

                    _.forEach(result.streams, function(stream) {
                        $('#stream').append($('<option></option>').attr('value', stream.streamId).text(stream.streamId));
                    });
                } else {
                    $('#stream').append($('<option></option>').attr('value', '').text('No stream available - Please publish a stream'));
                }
            }).fail(function(jqXHR, textStatus, errorThrown) {
                app.createNotification('danger', {
                    icon: 'glyphicon glyphicon-remove-sign',
                    title: '<strong>Streams</strong>',
                    message: 'Failed to list streams (' + (errorThrown || jqXHR.status) + ')'
                });
            });
        };

        var createStreamToken = function createStreamToken(targetElementSelector, applicationId, secret, sessionId, originStreamId, capabilities, callback) {
            var data = {
                applicationId: applicationId,
                secret: secret,
                sessionId: sessionId,
                originStreamId: originStreamId,
                capabilities: capabilities
            };

            $.ajax({
                url: adminBaseUri + '/pcast/stream',
                accepts: 'application/json',
                contentType: 'application/json',
                method: 'POST',
                data: JSON.stringify(data)
            }).done(function(result) {
                $(targetElementSelector).val(result.streamToken);
                app.createNotification('success', {
                    icon: 'glyphicon glyphicon-film',
                    title: '<strong>Stream</strong>',
                    message: 'Created token for stream "' + originStreamId + '"'
                });
                callback(result.streamToken);
            }).fail(function(jqXHR, textStatus, errorThrown) {
                app.createNotification('danger', {
                    icon: 'glyphicon glyphicon-remove-sign',
                    title: '<strong>Stream</strong>',
                    message: 'Failed to create stream token (' + (errorThrown || jqXHR.status) + ')'
                });
            });
        };

        var createStreamTokenForPublishing = function createStreamTokenForPublishing() {
            var applicationId = $('#applicationId').val();
            var secret = $('#secret').val();
            var sessionId = $('#sessionIdForPublishing').val();
            var originStreamId = '';
            var capabilities = [];

            $('#publish-capabilities option:selected').each(function() {
                capabilities.push($(this).val());
            });

            capabilities.push($('#publish-quality option:selected').val());

            return createStreamToken('.streamTokenForPublishing', applicationId, secret, sessionId, originStreamId, capabilities, function() {
                app.activateStep('step-5-3');
                setTimeout(function() {
                    app.activateStep('step-5-4');
                }, 1500);
            });
        };

        var createStreamTokenForViewing = function createStreamTokenForViewing() {
            var applicationId = $('#applicationId').val();
            var secret = $('#secret').val();
            var sessionId = $('#sessionIdForViewing').val();
            var originStreamId = $('#originStreamId').val();
            var capabilities = [];

            capabilities.push($('#subscriber-mode option:selected').val());

            $('#subscriber-drm-capabilities option:selected').each(function() {
                capabilities.push($(this).val());
            });

            return createStreamToken('.streamTokenForViewing', applicationId, secret, sessionId, originStreamId, capabilities, function() {
                app.activateStep('step-7');
                setTimeout(function() {
                    app.activateStep('step-8');
                }, 1500);
            });
        };

        var subscriberMediaStream = null;

        var subscribe = function subscribe() {
            var streamToken = $('#streamTokenForViewing').val();
            var subscriberOptions = {};

            if (app.getUrlParameter('targetDuration')) {
                subscriberOptions.hlsTargetDuration = parseInt(app.getUrlParameter('targetDuration'));
            }

            if (app.getUrlParameter('preferNative')) {
                subscriberOptions.preferNative = app.getUrlParameter('preferNative') === 'true';
            }

            pcast.subscribe(streamToken, function subscribeCallback(pcast, status, mediaStream) {
                if (status !== 'ok') {
                    app.createNotification('danger', {
                        icon: 'glyphicon glyphicon-remove-sign',
                        title: '<strong>Subscribe</strong>',
                        message: 'Failed to subscribe to stream (' + status + ')'
                    });

                    return;
                }

                stopSubscriber();

                mediaStream.monitor({}, monitorStream);

                mediaStream.setStreamErrorCallback(function(mediaStream, errSource, err) {
                    var errTitle = 'Stream Error';
                    var errMessage = err;

                    if (errSource === 'shaka') {
                        if (err && err.category) {
                            errTitle = 'Shaka ' + (shakaErrorCategories[err.category] ? shakaErrorCategories[err.category] : '') + ' Error';
                        }

                        if (err && err.data) {
                            errMessage = err.data;
                        }
                    }

                    app.createNotification('danger', {
                        icon: 'glyphicon glyphicon-facetime-video',
                        title: '<strong>' + errTitle + '</strong>',
                        message: errMessage
                    });
                });

                var primaryMediaStream = mediaStream;

                if (mediaStream.getStream() && mediaStream.getStream().getTracks().length > 2) {
                    primaryMediaStream = mediaStream.select(function(track, index) {
                        return (track.kind === 'video' || track.kind === 'audio') && index < 2;
                    });
                }

                primaryPlayer = new Player('remoteVideo', {
                    minWidth: 320,
                    minHeight: 240
                });

                primaryPlayer.start(primaryMediaStream);

                if (mediaStream.getStream() && mediaStream.getStream().getTracks().length > 2) {
                    var secondaryMediaStream = mediaStream.select(function(track, index) {
                        return track.kind === 'video' && index === 2;
                    });

                    secondaryPlayer = new Player('remoteVideoSecondary', {
                        minWidth: 320,
                        minHeight: 240
                    });

                    secondaryPlayer.start(secondaryMediaStream);
                }

                app.createNotification('success', {
                    icon: 'glyphicon glyphicon-film',
                    title: '<strong>Stream</strong>',
                    message: 'Starting stream'
                });

                subscriberMediaStream = mediaStream;
                $('#stopSubscriber').removeClass('disabled');
            }, subscriberOptions);
        };

        var stopSubscriber = function(reason) {
            if (subscriberMediaStream) {
                subscriberMediaStream.stop(reason);
                subscriberMediaStream = null;
                $('#stopSubscriber').addClass('disabled');
            }

            if (primaryPlayer) {
                primaryPlayer.stop();
            }

            if (secondaryPlayer) {
                secondaryPlayer.stop();
            }
        };

        var monitorStream = function monitorStream(stream, reason) {
            switch (reason) {
            case 'client-side-failure':
                app.createNotification('danger', {
                    icon: 'glyphicon glyphicon-remove-sign',
                    title: '<strong>Monitor</strong>',
                    message: 'Stream Failure'
                });

                // Handle failure event, redo stream
                break;
            default:
                app.createNotification('success', {
                    icon: 'glyphicon glyphicon-film',
                    title: '<strong>Monitor</strong>',
                    message: 'Stream Healthy'
                });

                // No failure has occurred, handle monitor event
                break;
            }
        };

        app.setOnReset(function() {
            createPCast();
            app.setLoggerEnvironment(pcast);
            listStreams();
        });

        $('#applicationId').change(function() {
            listStreams();
            app.setLoggerUserId(pcast);
        });

        $('#secret').change(listStreams);
        $('#createAuthToken').click(createAuthToken);

        $('#start').click(start);
        $('#stop').click(stop);

        $('#getUserMedia').click(getUserMedia);
        $('#stopUserMedia').click(stopUserMedia);
        $('#createStreamTokenForPublishing').click(createStreamTokenForPublishing);
        $('#publish').click(publish);
        $('#stopPublisher').click(stopPublisher);
        $('#stream').change(onStreamSelected);
        $('#stream-refresh').click(listStreams);

        $('#createStreamTokenForViewing').click(createStreamTokenForViewing);

        $('#subscribe').click(subscribe);
        $('#stopSubscriber').click(_.bind(stopSubscriber, null, 'stopped-by-user'));

        createPCast();
    };

    $(function() {
        app.init();
        init();

        // Plugin might load with delay
        if (sdk.RTC.phenixSupported && !sdk.RTC.isPhenixEnabled()) {
            sdk.RTC.onload = function() {
                app.init();
                init();
            };
        }
    });
});