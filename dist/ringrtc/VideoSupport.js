"use strict";
//
// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
//
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasVideoRenderer = exports.MAX_VIDEO_CAPTURE_BUFFER_SIZE = exports.MAX_VIDEO_CAPTURE_AREA = exports.MAX_VIDEO_CAPTURE_HEIGHT = exports.MAX_VIDEO_CAPTURE_WIDTH = exports.GumVideoCapturer = exports.GumVideoCaptureOptions = exports.VideoPixelFormatEnum = void 0;
// Given a weird name to not conflict with WebCodec's VideoPixelFormat
var VideoPixelFormatEnum;
(function (VideoPixelFormatEnum) {
    VideoPixelFormatEnum[VideoPixelFormatEnum["I420"] = 0] = "I420";
    VideoPixelFormatEnum[VideoPixelFormatEnum["Nv12"] = 1] = "Nv12";
    VideoPixelFormatEnum[VideoPixelFormatEnum["Rgba"] = 2] = "Rgba";
})(VideoPixelFormatEnum = exports.VideoPixelFormatEnum || (exports.VideoPixelFormatEnum = {}));
function videoPixelFormatFromEnum(format) {
    switch (format) {
        case VideoPixelFormatEnum.I420: {
            return 'I420';
        }
        case VideoPixelFormatEnum.Nv12: {
            return 'NV12';
        }
        case VideoPixelFormatEnum.Rgba: {
            return 'RGBA';
        }
    }
}
function videoPixelFormatToEnum(format) {
    switch (format) {
        case 'I420': {
            return VideoPixelFormatEnum.I420;
        }
        case 'NV12': {
            return VideoPixelFormatEnum.Nv12;
        }
        case 'RGBA': {
            return VideoPixelFormatEnum.Rgba;
        }
    }
}
class GumVideoCaptureOptions {
    constructor() {
        this.maxWidth = 640;
        this.maxHeight = 480;
        this.maxFramerate = 30;
    }
}
exports.GumVideoCaptureOptions = GumVideoCaptureOptions;
class GumVideoCapturer {
    constructor(defaultCaptureOptions) {
        this.spawnedSenderRunning = false;
        this.defaultCaptureOptions = defaultCaptureOptions;
    }
    capturing() {
        return this.captureOptions != undefined;
    }
    setLocalPreview(localPreview) {
        var _a;
        const oldLocalPreview = (_a = this.localPreview) === null || _a === void 0 ? void 0 : _a.current;
        if (oldLocalPreview) {
            oldLocalPreview.srcObject = null;
        }
        this.localPreview = localPreview;
        this.updateLocalPreviewSourceObject();
        // This is a dumb hack around the fact that sometimes the
        // this.localPreview.current is updated without a call
        // to setLocalPreview, in which case the local preview
        // won't be rendered.
        if (this.updateLocalPreviewIntervalId != undefined) {
            clearInterval(this.updateLocalPreviewIntervalId);
        }
        this.updateLocalPreviewIntervalId = setInterval(this.updateLocalPreviewSourceObject.bind(this), 1000);
    }
    enableCapture() {
        // tslint:disable no-floating-promises
        this.startCapturing(this.defaultCaptureOptions);
    }
    enableCaptureAndSend(sender, options) {
        // tslint:disable no-floating-promises
        this.startCapturing(options !== null && options !== void 0 ? options : this.defaultCaptureOptions);
        this.startSending(sender);
    }
    disable() {
        this.stopCapturing();
        this.stopSending();
        if (this.updateLocalPreviewIntervalId != undefined) {
            clearInterval(this.updateLocalPreviewIntervalId);
        }
        this.updateLocalPreviewIntervalId = undefined;
    }
    setPreferredDevice(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            this.preferredDeviceId = deviceId;
            if (this.captureOptions) {
                const captureOptions = this.captureOptions;
                const sender = this.sender;
                this.disable();
                this.startCapturing(captureOptions);
                if (sender) {
                    this.startSending(sender);
                }
            }
        });
    }
    enumerateDevices() {
        return __awaiter(this, void 0, void 0, function* () {
            const devices = yield window.navigator.mediaDevices.enumerateDevices();
            const cameras = devices.filter(d => d.kind == 'videoinput');
            return cameras;
        });
    }
    getUserMedia(options) {
        var _a;
        // TODO: Figure out a better way to make typescript accept "mandatory".
        let constraints = {
            audio: false,
            video: {
                deviceId: (_a = options.preferredDeviceId) !== null && _a !== void 0 ? _a : this.preferredDeviceId,
                width: {
                    max: options.maxWidth,
                },
                height: {
                    max: options.maxHeight,
                },
                frameRate: {
                    max: options.maxFramerate,
                },
            },
        };
        if (options.screenShareSourceId != undefined) {
            constraints.video = {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: options.screenShareSourceId,
                    maxWidth: options.maxWidth,
                    maxHeight: options.maxHeight,
                    maxFrameRate: options.maxFramerate,
                },
            };
        }
        return window.navigator.mediaDevices.getUserMedia(constraints);
    }
    startCapturing(options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.capturing()) {
                return;
            }
            this.captureOptions = options;
            try {
                // If we start/stop/start, we may have concurrent calls to getUserMedia,
                // which is what we want if we're switching from camera to screenshare.
                // But we need to make sure we deal with the fact that things might be
                // different after the await here.
                const mediaStream = yield this.getUserMedia(options);
                // It's possible video was disabled, switched to screenshare, or
                // switched to a different camera while awaiting a response, in
                // which case we need to disable the camera we just accessed.
                if (this.captureOptions != options) {
                    for (const track of mediaStream.getVideoTracks()) {
                        // Make the light turn off faster
                        track.stop();
                    }
                    return;
                }
                this.mediaStream = mediaStream;
                if (!this.spawnedSenderRunning &&
                    this.mediaStream != undefined &&
                    this.sender != undefined) {
                    this.spawnSender(this.mediaStream, this.sender);
                }
                this.updateLocalPreviewSourceObject();
            }
            catch (e) {
                // It's possible video was disabled, switched to screenshare, or
                // switched to a different camera while awaiting a response, in
                // which case we should reset the captureOptions if we set them.
                if (this.captureOptions == options) {
                    // We couldn't open the camera.  Oh well.
                    this.captureOptions = undefined;
                }
            }
        });
    }
    stopCapturing() {
        if (!this.capturing()) {
            return;
        }
        this.captureOptions = undefined;
        if (!!this.mediaStream) {
            for (const track of this.mediaStream.getVideoTracks()) {
                // Make the light turn off faster
                track.stop();
            }
            this.mediaStream = undefined;
        }
        this.updateLocalPreviewSourceObject();
    }
    startSending(sender) {
        if (this.sender === sender) {
            return;
        }
        if (!!this.sender) {
            // If we're replacing an existing sender, make sure we stop the
            // current setInterval loop before starting another one.
            this.stopSending();
        }
        this.sender = sender;
        if (!this.spawnedSenderRunning && this.mediaStream != undefined) {
            this.spawnSender(this.mediaStream, this.sender);
        }
    }
    spawnSender(mediaStream, sender) {
        const track = mediaStream.getVideoTracks()[0];
        if (track == undefined || this.spawnedSenderRunning) {
            return;
        }
        const reader = new MediaStreamTrackProcessor({
            track,
        }).readable.getReader();
        const buffer = Buffer.alloc(exports.MAX_VIDEO_CAPTURE_BUFFER_SIZE);
        this.spawnedSenderRunning = true;
        (() => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                while (sender === this.sender && mediaStream == this.mediaStream) {
                    const { done, value: frame } = yield reader.read();
                    if (done) {
                        break;
                    }
                    if (!frame) {
                        continue;
                    }
                    try {
                        const format = videoPixelFormatToEnum((_a = frame.format) !== null && _a !== void 0 ? _a : 'I420');
                        if (format == undefined) {
                            console.warn(`Unsupported video frame format: ${frame.format}`);
                            break;
                        }
                        frame.copyTo(buffer);
                        sender.sendVideoFrame(frame.codedWidth, frame.codedHeight, format, buffer);
                    }
                    finally {
                        // This must be called for more frames to come.
                        frame.close();
                    }
                }
            }
            finally {
                reader.releaseLock();
            }
            this.spawnedSenderRunning = false;
        }))();
    }
    stopSending() {
        // The spawned sender should stop
        this.sender = undefined;
    }
    updateLocalPreviewSourceObject() {
        if (!this.localPreview) {
            return;
        }
        const localPreview = this.localPreview.current;
        if (!localPreview) {
            return;
        }
        const { mediaStream = null } = this;
        if (localPreview.srcObject === mediaStream) {
            return;
        }
        if (mediaStream) {
            localPreview.srcObject = mediaStream;
            if (localPreview.width === 0) {
                localPreview.width = this.captureOptions.maxWidth;
            }
            if (localPreview.height === 0) {
                localPreview.height = this.captureOptions.maxHeight;
            }
        }
        else {
            localPreview.srcObject = null;
        }
    }
}
exports.GumVideoCapturer = GumVideoCapturer;
// We add 10% in each dimension to allow for things that are slightly wider or taller than 1080p.
const MAX_VIDEO_CAPTURE_MULTIPLIER = 1.0;
exports.MAX_VIDEO_CAPTURE_WIDTH = 1920 * MAX_VIDEO_CAPTURE_MULTIPLIER;
exports.MAX_VIDEO_CAPTURE_HEIGHT = 1080 * MAX_VIDEO_CAPTURE_MULTIPLIER;
exports.MAX_VIDEO_CAPTURE_AREA = exports.MAX_VIDEO_CAPTURE_WIDTH * exports.MAX_VIDEO_CAPTURE_HEIGHT;
exports.MAX_VIDEO_CAPTURE_BUFFER_SIZE = exports.MAX_VIDEO_CAPTURE_AREA * 4;
class CanvasVideoRenderer {
    constructor() {
        this.buffer = Buffer.alloc(exports.MAX_VIDEO_CAPTURE_BUFFER_SIZE);
    }
    setCanvas(canvas) {
        this.canvas = canvas;
    }
    enable(source) {
        if (this.source === source) {
            return;
        }
        if (!!this.source) {
            // If we're replacing an existing source, make sure we stop the
            // current rAF loop before starting another one.
            if (this.rafId) {
                window.cancelAnimationFrame(this.rafId);
            }
        }
        this.source = source;
        this.requestAnimationFrameCallback();
    }
    disable() {
        this.renderBlack();
        this.source = undefined;
        if (this.rafId) {
            window.cancelAnimationFrame(this.rafId);
        }
    }
    requestAnimationFrameCallback() {
        this.renderVideoFrame();
        this.rafId = window.requestAnimationFrame(this.requestAnimationFrameCallback.bind(this));
    }
    renderBlack() {
        if (!this.canvas) {
            return;
        }
        const canvas = this.canvas.current;
        if (!canvas) {
            return;
        }
        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }
        context.fillStyle = 'black';
        context.fillRect(0, 0, canvas.width, canvas.height);
    }
    renderVideoFrame() {
        var _a, _b;
        if (!this.source || !this.canvas) {
            return;
        }
        const canvas = this.canvas.current;
        if (!canvas) {
            return;
        }
        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }
        const frame = this.source.receiveVideoFrame(this.buffer);
        if (!frame) {
            return;
        }
        const [width, height] = frame;
        if (canvas.clientWidth <= 0 ||
            width <= 0 ||
            canvas.clientHeight <= 0 ||
            height <= 0) {
            return;
        }
        const frameAspectRatio = width / height;
        const canvasAspectRatio = canvas.clientWidth / canvas.clientHeight;
        let dx = 0;
        let dy = 0;
        if (frameAspectRatio > canvasAspectRatio) {
            // Frame wider than view: We need bars at the top and bottom
            canvas.width = width;
            canvas.height = width / canvasAspectRatio;
            dy = (canvas.height - height) / 2;
        }
        else if (frameAspectRatio < canvasAspectRatio) {
            // Frame narrower than view: We need pillars on the sides
            canvas.width = height * canvasAspectRatio;
            canvas.height = height;
            dx = (canvas.width - width) / 2;
        }
        else {
            // Will stretch perfectly with no bars
            canvas.width = width;
            canvas.height = height;
        }
        if (dx > 0 || dy > 0) {
            context.fillStyle = 'black';
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        if (((_a = this.imageData) === null || _a === void 0 ? void 0 : _a.width) !== width || ((_b = this.imageData) === null || _b === void 0 ? void 0 : _b.height) !== height) {
            this.imageData = new ImageData(width, height);
        }
        this.imageData.data.set(this.buffer.subarray(0, width * height * 4));
        context.putImageData(this.imageData, dx, dy);
    }
}
exports.CanvasVideoRenderer = CanvasVideoRenderer;
