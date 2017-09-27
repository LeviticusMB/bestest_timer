
$(document).ready(function () {
	if (!window.bestest_timer) {
		return;
	}

	var cleanState = {
		started: null,
		comment: null,
		descr: null,
		project: null,
		issue: null,
		activity: null,
		activities: null,
		lastActivity: null,
		nagged: null,
	};

	var idleStartThreshold = 10 * 60;
	var idleStopThreshold  = 30 * 60;
	var idleUserThreshold  = 30 * 60;

	var userLastSeen = Date.now();

	var state;
	var stateKey = 'bestest_timer/' + bestest_timer.user_id;
	var button   = $('<button class="bestest_timer_button"></button>');
	var dialog   = null;

	function updateUI() {
		var enabled = false;
		var title   = null;

		if (state.started) {
			enabled = true;
			title   = t('logging_since', { descr: state.descr, time: toTime(new Date(state.started)) });
		}

		if (!bestest_timer.api_key) {
			title = t('need_rest_api');
		}
		else if (!bestest_timer.project && !bestest_timer.issue) {
			title = t('nothing_inferred');
		}
		else if (!bestest_timer.activities) {
			title = t('not_enabled',  { project: bestest_timer.project.name });
		}
		else if (!bestest_timer.access) {
			title = t('no_permission', { project: bestest_timer.project.name });
		}
		else {
			enabled = true;
		}

		button.text(state.started ? t('recording') : t('start')).attr('title', title).attr('disabled', !enabled);

	}

	function loadState() {
		state = JSON.parse(localStorage.getItem(stateKey) || JSON.stringify(cleanState));

		// Migrate state from v1.0
		if (typeof state.project === 'number') {
			state.project = { id: state.project, _lnk: 'Project ' + state.project };
		}

		if (typeof state.issue === 'number') {
			state.issue = { id: state.issue, _lnk: 'Issue #' + state.issue };
		}

		updateUI();
	}

	function clearState() {
		state = JSON.parse(JSON.stringify(cleanState));
		saveState();
	}

	function saveState() {
		localStorage.setItem(stateKey, JSON.stringify(state));
		updateUI();
	}

	$(window).bind('storage', function(event) {
		if (event.originalEvent.key === stateKey) {
			loadState();

			if (!state.started && dialog) {
				dialog.dialog('close');
			}
		}
	});

	function userDetected() {
		userLastSeen = Date.now();

		if (!arguments[0] || !/mousemove|scroll/.test(arguments[0].type)) {
			console.log("User presence detected!");
		}
	}

	function activityDetected(ts) {
		if (!state.nagged /* Once we've nagged once, leave lastActivity as-is */) {
			state.lastActivity = ts || Date.now();
			saveState();
			console.log("Activity detected at " + new Date(state.lastActivity));
		}
	}

	function checkIdleTimeout() {
		var now = Date.now();

		if (state.nagged)  {
			return;
		}

		// User idle handling
		var idle = (now - userLastSeen) / 1000;

		if (!state.lastActivity || !state.started && idle > idleUserThreshold) {
			// Once user has been idle idleUserThreshold sec and is *not* working, set activity to time when user returns
			console.log("Not working checkpoint");
			activityDetected();
		}
		else if (state.started && idle > idleUserThreshold) {
			// Once user has been idle idleUserThreshold sec and *is* working, set activity to time when user left
			console.log("Is working checkpoint");
			activityDetected(userLastSeen)
		}

		// Activity reminder handling
		var delta = (now - state.lastActivity) / 1000;

		console.log(`Last activity: ${delta} sec ago. User last seen ${idle} sec ago`);

		if (state.started && delta > idleStopThreshold) {
			console.warn/*displayNotification*/(t('should_punch_out_title'), t('should_punch_out_message', { time: delta }), null);
			state.nagged = now;
			saveState();
		}
		else if (!state.started && idle < 60 && delta > idleStartThreshold) {
			console.warn/*displayNotification*/(t('should_punch_in_title'), t('should_punch_in_message', { time: delta }), null);
			state.nagged = now;
			saveState();
		}
	}

	function start() {
		if (!bestest_timer.api_key) {
			alert(t('need_rest_api'));
		}
		else if (!bestest_timer.project && !bestest_timer.issue) {
			alert(t('nothing_inferred'));
		}
		else if (!bestest_timer.activities) {
			alert(t('not_enabled',  { project: bestest_timer.project.name }));
		}
		else if (!bestest_timer.access) {
			alert(t('no_permission', { project: bestest_timer.project.name }));
		}
		else {
			state = {
				started:      Date.now(),
				comment:      '',
				descr:        t(bestest_timer.issue ? 'state_descr_issue' : 'state_descr', {
				                project: bestest_timer.project.name,
				                issue: bestest_timer.issue && bestest_timer.issue.id
				              }),
				project:      $.extend({}, bestest_timer.project, { _lnk: bestest_timer.project_lnk }),
				issue:        bestest_timer.issue && $.extend({}, bestest_timer.issue, { _lnk: bestest_timer.issue_lnk }),
				activity:     (bestest_timer.activities.filter(function (activity) { return activity.is_default; })[0] || { id: null }).id,
				activities:   bestest_timer.activities,
				lastActivity: null,
				nagged:       null,
			}
			saveState();
		}
	}

	function commit() {
		var stopped = Date.now();
		var comment = (state.comment + ' [' + timeComment(stopped) + ']').trim();

		$.ajax(bestest_timer.timelog_url, {
			method: 'POST',
			data: JSON.stringify({
				time_entry: {
					project_id: state.project.id,
					issue_id: state.issue && state.issue.id,
					activity_id: state.activity,
					hours: (stopped - state.started) / 1000 / 60 / 60,
					comments: comment,
				}
			}),
			contentType: 'application/json',
			headers: {
				'X-Redmine-API-Key': bestest_timer.api_key,
			},
		})
		.done(function (response) {
			var te = response.time_entry;
			displayNotification(t('notification_title', { hours: te.hours, descr: state.descr }), te.comments, te.id);
			clearState();
		})
		.fail(function ($xhr) {
			console.log(arguments);
			alert(t('submit_failed', { error: $xhr.responseJSON && $xhr.responseJSON.errors }));
		});
	}

	function discard() {
		clearState();
	}

	function openDialog() {
		if (dialog) {
			dialog.dialog('destroy');
		}

		var form       = $('<form/>').submit(false);
		var activities = $('<fieldset>').append($('<legend/>').text(t('activity')));
		var labels     = $('<div>', { 'class': 'bestest_timer_activities' }).appendTo(activities);

		state.activities.forEach(function (activity) {
			$('<label/>')
				.append($('<input/>', { type: 'radio', name: 'activity', value: activity.id, checked: activity.id === state.activity })
					.click(function() {
						state.activity = Number(this.value);
						enableOrDisableCommit();
					})
				)
				.append(document.createTextNode(activity.name))
				.appendTo(labels);
		});

		[
			$('<fieldset/>').append($('<legend/>').text(t('details'))).append(
				$('<table/>').append(
					$('<tr/>').append($('<td/>').text(t('time')), $('<td/>').text(timeComment(Date.now()))),
					$('<tr/>').append($('<td/>').text(t('project')), $('<td/>').html(state.project._lnk)),
					state.issue && $('<tr/>').append($('<td/>').text(t('issue')), $('<td/>').html(state.issue._lnk))
				)
			),
			activities,
			$('<fieldset/>').append($('<legend/>').text(t('comment'))).append(
				$('<input id="bestest_timer_comment" type="text" autocomplete="off" autofocus />').attr('value', state.comment)
					.change(function () {
						state.comment = this.value;
					})
					.keyup(function (event) {
						if (event.keyCode === 13) {
							commit();
							dialog.dialog('close');
						}
					})
			)
		].forEach(function (elem) {
			form.append(elem);
		});

		dialog = form.dialog({
			dialogClass: 'bestest_timer_dialog',
			position: { my: 'right top', at: 'right bottom', of: button },
			width: 450,
			draggable: false,
			modal: true,
			hide: 200,
			show: 200,
			title: t('plugin_name'),

			open: function() { // Hack to remove black line in Safari
				if (/Apple/.test(window.navigator.vendor)) {
					$('.bestest_timer_dialog').each(function(idx, elem) {
						elem.style.background = window.getComputedStyle(elem).backgroundColor;
					});
				}

				enableOrDisableCommit();
			},

			buttons: [
				{
					text: t('commit'), icons: { primary: 'ui-icon-clock' }, id: 'bestest_timer_commit', click: function () {
						commit();
						dialog.dialog('close');
						activityDetected();
					}
				},
				{
					text: t('discard'), icons: { primary: 'ui-icon-trash' }, click: function () {
						discard();
						dialog.dialog('close');
						activityDetected();
					}
				},
				{
					text: t('close'), icons: { primary: 'ui-icon-close' }, click: function () {
						saveState();
						dialog.dialog('close');
						activityDetected();
					}
				},
			]
		});
	}

	function toTime(date) {
		return date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: 'numeric' });
	}

	function timeComment(stopped) {
		return toTime(new Date(state.started)) + '–' + toTime(new Date(stopped));
	}

	function enableOrDisableCommit() {
		var disabled = !state.activity;

		$('#bestest_timer_commit').attr('disabled', disabled).toggleClass('ui-state-disabled', disabled);
	}

	function displayNotification(title, message, idx) {
		if (!window.Notification) {
			alert(title + ': ' + message);
		}
		else if (Notification.permission === 'granted') {
			var entry = new Notification(title, { body: message });

			if (idx) {
				$(entry).click(function () {
					window.location.href = bestest_timer.timelog_idx.replace('XXX', idx);
				});
			}
		}
		else if (Notification.permission !== 'denied') {
			Notification.requestPermission(function (permission) {
				if (permission === 'granted') {
					displayNotification(title, message, idx);
				}
			});
		}
	}

	function t(key, props) {
		return (bestest_timer.lang[key] || key).replace(/%{([^}]+)}/g, function(_, prop) {
			return String(Object(props)[prop]);
		});
	}

	button.click(function () {
		if (!state.started) {
			start();
		}
		else {
			openDialog();
		}

		activityDetected();
	});

	loadState();

	$('#quick-search').append(button);

	setInterval(checkIdleTimeout, 10000);

	document.addEventListener && document.addEventListener("visibilitychange", function() {
		document.hidden || userDetected();
	}, false);

	$(window).focus(userDetected);
	$(window).keydown(userDetected);
	$(window).click(userDetected);
	$(window).scroll(userDetected);
	$(window).mousemove(userDetected);
});
