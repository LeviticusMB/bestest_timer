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
		userLastSeen: Date.now(),
	};

	var beta = localStorage.getItem('bestest_timer') === 'beta';

	var idleThreshold       =  1 * 60;
	var idleStartThreshold  =  5 * 60;
	var idleStopThreshold   = 45 * 60;
	var idleSleepThreshold  = 30 * 60;

	var state;
	var stateKey = 'bestest_timer/' + bestest_timer.user_id;
	var button   = $('<button class="bestest_timer_button"></button>');
	var dialog   = null;

	function updateUI() {
		var enabled = false;
		var title   = null;

		if (state.started) {
			enabled = true;
			title   = t('logging_since', { descr: state.descr, time: toTime(state.started) });
			recording = t('recording', { hhmm: new Date(Date.now() - state.started).toISOString().slice(11, -8) });
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

		button.text(state.started ? recording : t('start')).attr('title', title).attr('disabled', !enabled);
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

	$(window).bind('storage', function (event) {
		if (event.originalEvent.key === stateKey) {
			loadState();

			if (!state.started && dialog) {
				dialog.dialog('close');
			}
		}
	});

	function userDetected() {
		var now  = Date.now();
		var last = state.userLastSeen;

		if (now - last > idleThreshold * 1000 && currentIssueVisible()) {
			// User returned to view current issue
			activityDetected();
		}

		state.userLastSeen = now;

		if (now - last > 1000) {
			saveState();
		}
	}

	function activityDetected(ts) {
		state.lastActivity = ts || Date.now();
		saveState();
	}

	function currentIssueVisible() {
		return state.started &&
		      (state.project && bestest_timer.project && state.project.id === bestest_timer.project.id) &&
              (!state.issue  || bestest_timer.issue   && state.issue.id   === bestest_timer.issue.id);
	}

	function checkIdleTimeout() {
		var now = Date.now();

		// User idle handling
		var idle = (now - state.userLastSeen) / 1000;

		if (!state.lastActivity) {
			activityDetected();
		}
		else if (idle > idleSleepThreshold) {
			// * Once user is *not* working, set activity to time when user returns
			// * Once user *is* working, set activity to time when user left
			activityDetected(state.started ? state.userLastSeen : Date.now());
		}
		else if (!state.started /* Not working */ &&
		         now - state.lastActivity > 4 * 3600 * 1000 /* Last activity > 4 hrs ago */ &&
		         new Date(state.lastActivity).getDate() != new Date().getDate() /* Not today */) {
			activityDetected();
		}

		// Activity reminder handling
		var inactive = (now - state.lastActivity) / 1000;

		if (!state.nagged && state.started && inactive > idleStopThreshold) {
			state.nagged = now;
			saveState();

			displayNotification(t('should_punch_out_title'), t('should_punch_out_message', { descr: state.descr, time: toTime(state.lastActivity) }), function () {
				openDialog();
			});
		}
		else if (!state.nagged && !state.started && idle < idleThreshold /* not idle */ && inactive > idleStartThreshold) {
			state.nagged = now;
			saveState();

			displayNotification(t('should_punch_in_title'), t('should_punch_in_message', { time: toTime(state.lastActivity) }));
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

	function commit(stopped) {
		var comment = timeComment(state.comment, state.started, stopped);

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
			displayNotification(t('notification_title', { hours: response.time_entry.hours, descr: state.descr }), response.time_entry.comments, function () {
				window.location.href = bestest_timer.timelog_idx.replace('XXX', response.time_entry.id);
			});

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
					.click(function () {
						state.activity = Number(this.value);
						saveState();
						enableOrDisableCommit();
					})
				)
				.append(document.createTextNode(activity.name))
				.appendTo(labels);
		});

		[
			$('<fieldset/>').append($('<legend/>').text(t('details'))).append(
				$('<table/>').append(
					$('<tr/>').append($('<td/>').text(t('time')), $('<td/>').append(
						$('<input id="bestest_timer_start" type="time" pattern="[0-9]{2}:[0-9]{2}" size="5"/>')
							.attr('value', toTime(state.started))
							.on('input', function () {
								if (!this.value) {
									this.value = toTime(state.started);
								}
							}),
						'–',
						$('<input id="bestest_timer_stop" type="time" pattern="[0-9]{2}:[0-9]{2}" size="5"/>')
							.attr('value', toTime(Date.now()))
							.on('input', function () {
								if (!this.value) {
									this.value = toTime(Date.now());
								}
							})
					)),
					$('<tr/>').append($('<td/>').text(t('project')), $('<td/>').html(state.project._lnk)),
					state.issue && $('<tr/>').append($('<td/>').text(t('issue')), $('<td/>').html(state.issue._lnk))
				)
			),
			activities,
			$('<fieldset/>').append($('<legend/>').text(t('comment'))).append(
				$('<input id="bestest_timer_comment" type="text" autocomplete="off" autofocus />').attr('value', state.comment)
					.change(function () {
						state.comment = this.value;
						saveState();
					})
					.keyup(function (event) {
						if (event.keyCode === 13) {
							state.started = updateTime(state.started, 'bestest_timer_start');
							commit(updateTime(Date.now(), 'bestest_timer_stop'));
							dialog.dialog('close');
							activityDetected();
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

			open: function () { // Hack to remove black line in Safari
				if (/Apple/.test(window.navigator.vendor)) {
					$('.bestest_timer_dialog').each(function (idx, elem) {
						elem.style.background = window.getComputedStyle(elem).backgroundColor;
					});
				}

				enableOrDisableCommit();
			},

			buttons: [
				{
					text: t('commit'), icons: { primary: 'ui-icon-clock' }, id: 'bestest_timer_commit', click: function () {
						state.started = updateTime(state.started, 'bestest_timer_start');
						commit(updateTime(Date.now(), 'bestest_timer_stop'));
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
						state.started = updateTime(state.started, 'bestest_timer_start');
						saveState();
						dialog.dialog('close');
						activityDetected();
					}
				},
			]
		});
	}

	function toTime(date) {
		date = date instanceof Date ? date : new Date(date);

		return date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: 'numeric' });
	}

	function timeComment(comment, started, stopped) {
		return (comment + ' [' + toTime(started) + '–' + toTime(stopped) + ']').trim();
	}

	function parseTime(time) {
		var parsed = /^(\d*(\.\d+)?)$|^((\d+)[:h])?((\d+)m?)?$/.exec(time);

		return parsed && parsed[1] ? parseFloat(parsed[1]) :
			   parsed ? parseInt(parsed[4] || 0) + parseInt(parsed[5] || 0) / 60 :
			   null;
	}

	function parseTimeComment(comment, refdate) {
		refdate = refdate || Date.now();

		function toTimestamp(hours) {
			return new Date(refdate).setHours(0, hours * 60, 0, 0);
		}

		var timecomment = /(.*)\[([0-9]{2}:[0-9]{2})[-–]([0-9]{2}:[0-9]{2})\]\s*$/.exec(comment);

		return timecomment && {
			comment: timecomment[1].trim(),
			started: toTimestamp(parseTime(timecomment[2])),
			stopped: toTimestamp(parseTime(timecomment[3]))
		};
	}

	function enableOrDisableCommit() {
		var disabled = !state.activity;

		$('#bestest_timer_commit').attr('disabled', disabled).toggleClass('ui-state-disabled', disabled);
	}

	function updateTime(ts, input) {
		var hhmm = /^([0-9]{2}):([0-9]{2})$/.exec(document.getElementById(input).value);

		if (hhmm) {
			var date = new Date(ts);
			date.setHours(hhmm[1]);
			date.setMinutes(hhmm[2]);
			ts = date.getTime();
		}

		return ts;
	}

	function displayNotification(title, message, onClickHandler) {
		if (!window.Notification) {
			if (confirm(title + ': ' + message) && onClickHandler) {
				onClickHandler();
			}
		}
		else if (Notification.permission === 'granted') {
			var entry = new Notification(title, { body: message });

			onClickHandler && $(entry).click(onClickHandler);
		}
		else if (Notification.permission !== 'denied') {
			Notification.requestPermission(function (permission) {
				if (permission === 'granted') {
					displayNotification(title, message, onClickHandler);
				}
			});
		}
	}

	function t(key, props) {
		return (bestest_timer.lang[key] || key).replace(/%{([^}]+)}/g, function (_, prop) {
			return String(Object(props)[prop]);
		});
	}

	// Insert punch button

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

	// Activate nag requesters

	setInterval(checkIdleTimeout, 1000);

	document.addEventListener && document.addEventListener('visibilitychange', function () {
		if (!document.hidden) {
			userDetected();
		}
	}, false);

	$(window).focus(userDetected);
	$(window).keydown(userDetected);
	$(window).click(userDetected);
	$(window).scroll(userDetected);
	$(window).mousemove(userDetected);

	userDetected();

	if (currentIssueVisible()) {
		// The issue/project we're logging to was just (re)loaded
		activityDetected();
	}

	// Curry "Edit time" fields

	var time_entry_hours    = $('form.edit_time_entry input#time_entry_hours');
	var time_entry_comments = $('form.edit_time_entry input#time_entry_comments');

	if (time_entry_hours.length == 1 && time_entry_comments.length == 1) {
		time_entry_hours.on('input', function() {
			var hr = parseTime(this.value)
			var tc = parseTimeComment(time_entry_comments.val());

			if (hr !== null && tc) {
				time_entry_comments.val(timeComment(tc.comment, tc.started, tc.started + hr * 3600000));
			}
		});

		time_entry_comments.on('input', function() {
			var tc = parseTimeComment(this.value);

			if (tc) {
				time_entry_hours.val(((tc.stopped - tc.started) / 3600000).toFixed(2));
			}
		});
	}
});
