'use strict';
// Aconst {BrowserWindow, app} = require('electron');
const isAccelerator = require('electron-is-accelerator');
const equals = require('keyboardevents-areequal');
const {toKeyEvent} = require('keyboardevent-from-electron-accelerator');
const insp = require('insp');
const _debug = require('debug');

const debug = _debug('electron-localshortcut');

// A placeholder to register shortcuts
// on any window of the app.
// const ANY_WINDOW = {};

const windowsWithShortcuts = new WeakMap();

function _checkAccelerator(accelerator) {
	if (!isAccelerator(accelerator)) {
		const w = {};
		Error.captureStackTrace(w);
		const msg = `
WARNING: ${accelerator} is not a valid accelerator.

${w.stack.split('\n').slice(4).join('\n')}
`;
		console.error(msg);
	}
}

/**
 * Disable all of the shortcuts registered on the BrowserWindow instance.
Registered shortcuts no more works on the `window` instance, but the module keep a reference on them. You can reactivate them later by calling `enableAll` method on the same window instance.
 * @param  {BrowserWindow} win BrowserWindow instance
 * @return {Undefined}
 */
function disableAll(win) {
	debug(`Disabling all shortcuts on window ${win.getTitle()}`);
	const wc = win.webContents;
	const shortcutsOfWindow = windowsWithShortcuts.get(wc);

	for (const shortcut of shortcutsOfWindow) {
		shortcut.enabled = false;
	}
}

/**
 * Enable all of the shortcuts registered on the BrowserWindow instance that you had previously disabled calling `disableAll` method.
 * @param  {BrowserWindow} win BrowserWindow instance
 * @return {Undefined}
 */
function enableAll(win) {
	debug(`Enabling all shortcuts on window ${win.getTitle()}`);
	const wc = win.webContents;
	const shortcutsOfWindow = windowsWithShortcuts.get(wc);

	for (const shortcut of shortcutsOfWindow) {
		shortcut.enabled = true;
	}
}

/**
 * Unregisters all of the shortcuts registered on any focused BrowserWindow instance. This method does not unregister any shortcut you registered on a particular window instance.
 * @param  {BrowserWindow} win BrowserWindow instance
 * @return {Undefined}
 */
function unregisterAll(win) {
	debug(`Unregistering all shortcuts on window ${win.getTitle()}`);
	const wc = win.webContents;
	const shortcutsOfWindow = windowsWithShortcuts.get(wc);

	// Remove listener from window
	shortcutsOfWindow.removeListener();

	windowsWithShortcuts.delete(wc);
}

function _normalizeEvent(input) {
	const normalizedEvent = {
		code: input.code,
		key: input.key
	};

	['alt', 'shift', 'meta'].forEach(prop => {
		if (typeof input[prop] !== 'undefined') {
			normalizedEvent[`${prop}Key`] = input[prop];
		}
	});

	if (typeof input.control !== 'undefined') {
		normalizedEvent.ctrlKey = input.control;
	}

	return normalizedEvent;
}

function _findShortcut(event, shortcutsOfWindow) {
	let i = 0;
	for (const shortcut of shortcutsOfWindow) {
		if (equals(shortcut.eventStamp, event)) {
			return i;
		}
		i++;
	}
	return -1;
}

const _onBeforeInput = shortcutsOfWindow => (e, input) => {
	if (input.type === 'keyUp') {
		return;
	}

	const event = _normalizeEvent(input);

	debug(insp`before-input-event: ${input} is translated to: ${event}`);
	for (const {eventStamp, callback} of shortcutsOfWindow) {
		if (equals(eventStamp, event)) {
			debug(insp`eventStamp: ${eventStamp} match`);
			callback();
			return;
		}
		debug(insp`eventStamp: ${eventStamp} no match`);
	}
};

/**
* Registers the shortcut `accelerator`on the BrowserWindow instance.
 * @param  {BrowserWindow} win - BrowserWindow instance to register. This argument could be omitted, in this case the function register the shortcut on all app windows.
 * @param  {String} accelerator - the shortcut to register
 * @param  {Function} callback    This function is called when the shortcut is pressed and the window is focused and not minimized.
 * @return {Undefined}
 */
function register(win, accelerator, callback) {
	debug(`Registering callback for ${accelerator} on window ${win.getTitle()}`);
	_checkAccelerator(accelerator);

	debug(`${accelerator} seems a valid shortcut sequence.`);

	const wc = win.webContents;

	let shortcutsOfWindow;
	if (windowsWithShortcuts.has(wc)) {
		debug(`Window has others shortcuts registered.`);
		shortcutsOfWindow = windowsWithShortcuts.get(wc);
	} else {
		debug(`This is the first shortcut of the window.`);
		shortcutsOfWindow = [];
		windowsWithShortcuts.set(wc, shortcutsOfWindow);

		const keyHandler = _onBeforeInput(shortcutsOfWindow);
		wc.on('before-input-event', keyHandler);

		// Save a reference to allow remove of listener from elsewhere
		shortcutsOfWindow.removeListener = () => wc.removeListener('before-input-event', keyHandler);
		wc.once('closed', shortcutsOfWindow.removeListener);
	}

	debug(`Adding shortcut to window set.`);

	const eventStamp = toKeyEvent(accelerator);

	shortcutsOfWindow.push({
		eventStamp,
		callback,
		enabled: true
	});

	debug(`Shortcut registered.`);
}

/**
 * Unregisters the shortcut of `accelerator` registered on the BrowserWindow instance.
 * @param  {BrowserWindow} win - BrowserWindow instance to unregister. This argument could be omitted, in this case the function unregister the shortcut on all app windows. If you registered the shortcut on a particular window instance, it will do nothing.
 * @param  {String} accelerator - the shortcut to unregister
 * @return {Undefined}
 */
function unregister(win, accelerator) {
	debug(`Unregistering callback for ${accelerator} on window ${win.getTitle()}`);
	_checkAccelerator(accelerator);

	debug(`${accelerator} seems a valid shortcut sequence.`);

	const wc = win.webContents;
	const shortcutsOfWindow = windowsWithShortcuts.get(wc);

	const eventStamp = toKeyEvent(accelerator);
	const shortcutIdx = _findShortcut(eventStamp, shortcutsOfWindow);
	if (shortcutIdx === -1) {
		return;
	}

	shortcutsOfWindow.splice(shortcutIdx, 1);

	// If the window has no more shortcuts,
	// we remove it early from the WeakMap
	// and unregistering the event listener
	if (shortcutsOfWindow.length === 0) {
		// Remove listener from window
		shortcutsOfWindow.removeListener();

		// Remove window from shrtcuts catalog
		windowsWithShortcuts.delete(wc);
	}
}

/**
 * Returns `true` or `false` depending on whether the shortcut `accelerator` is
registered on `window`.
 * @param  {BrowserWindow} win - BrowserWindow instance to check. This argument could be omitted, in this case the function returns whether the shortcut `accelerator` is registered on all app windows. If you registered the shortcut on a particular window instance, it return false.
 * @param  {String} accelerator - the shortcut to check
 * @return {Boolean} - if the shortcut `accelerator` is registered on `window`.
 */
function isRegistered(win, accelerator) {
	_checkAccelerator(accelerator);
}

module.exports = {
	register,
	unregister,
	isRegistered,
	unregisterAll,
	enableAll,
	disableAll
};
