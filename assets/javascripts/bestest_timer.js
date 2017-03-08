
$(document).ready(function () {
	if (!window.bestest_timer) {
		return;
	}

	var cleanState = {
		started: null,
		descr: null,
		project: null,
		issue: null,
		activity: null,
		comment: null,
		activities: null,
	};

	var state;
	var stateKey = 'bestest_timer/' + bestest_timer.user_id;
	var button   = $('<button class="bestest_timer_button"></button>');
	var dialog   = null;

	function updateUI() {
		button.text(state.started ? t('recording') : t('start'))
			.attr('title',
			state.started ? t('logging_since', { descr: state.descr, time: toTime(new Date(state.started)) }) : null);
	}

	function loadState() {
		state = JSON.parse(localStorage.getItem(stateKey) || JSON.stringify(cleanState));
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


	function toTime(date) {
		return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: 'numeric' });
	}

	function start() {
		if (!bestest_timer.api_key) {
			alert(t('need_rest_api'));
		}
		else if (!bestest_timer.project && !bestest_timer.issue) {
			alert(t('nothing_inferred'));
		}
		else if (!bestest_timer.access) {
			alert(t('no_permission', { project: bestest_timer.project.name }));
		}
		else {
			state.started = Date.now();
			state.descr = t(bestest_timer.issue ? 'state_descr_issue' : 'state_descr', {
				project: bestest_timer.project.name,
				issue: bestest_timer.issue && bestest_timer.issue.id
			});
			state.project = bestest_timer.project.id;
			state.issue = bestest_timer.issue && bestest_timer.issue.id;
			state.activity = (bestest_timer.activities.filter(function (activity) { return activity.is_default; })[0] || { id: null }).id;
			state.activities = bestest_timer.activities;
			saveState();
		}
	}

	function commit() {
		var stopped = new Date();
		var comment = ((state.comment || '') + ' [' + toTime(new Date(state.started)) + '-' + toTime(stopped) + ']').trim();

		$.ajax(bestest_timer.timelog_url, {
			method: 'POST',
			data: JSON.stringify({
				time_entry: {
					project_id: state.project,
					issue_id: state.issue,
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
			alert('Failed to send time entry to Redmine: ' + ($xhr.responseJSON && $xhr.responseJSON.errors));
		});
	}

	function discard() {
		clearState();
	}

	function openDialog() {
		if (dialog) {
			dialog.dialog('destroy');
		}

		var form = $('<form/>').submit(false);
		var fieldset = $('<fieldset>').append($('<legend/>').text(button.attr('title'))).appendTo(form);
		var select = $('<select id="bestest_timer_activity"/>')
			.change(function () {
				state.activity = Number(this.value);
			});

		if (!state.activity) {
			$('<option/>').appendTo(select);
		}

		state.activities.forEach(function (activity) {
			$('<option/>', { value: activity.id, selected: activity.id === state.activity }).text(activity.name).appendTo(select);
		});

		[
			$('<label for="bestest_timer_activity"></label>').text(t('activity')),
			select,
			$('<label for="bestest_timer_comment"></label>').text(t('comment')),
			$('<input id="bestest_timer_comment" type="text" size="50" autocomplete="off" autofocus />').attr('value', state.comment)
				.change(function () {
					state.comment = this.value;
				})
				.keyup(function(event) {
					if (event.keyCode === 13) {
						commit();
						dialog.dialog('close');
					}
				}),
		].forEach(function (elem) {
			fieldset.append(elem);
		});

		dialog = form.dialog({
			dialogClass: 'bestest_timer_dialog',
			position: { my: 'right top', at: 'right bottom', of: button },
			width: 400,
			draggable: false,
			modal: true,
			hide: 200,
			show: 200,
			title: t('plugin_name'),

			buttons: [
				{
					text: t('commit'), icons: { primary: 'ui-icon-clock' }, click: function () {
						commit();
						dialog.dialog('close');
					}
				},
				{
					text: t('discard'), icons: { primary: 'ui-icon-trash' }, click: function () {
						discard();
						dialog.dialog('close');
					}
				},
				{
					text: t('close'), icons: { primary: 'ui-icon-close' }, click: function () {
						saveState();
						dialog.dialog('close');
					}
				},
			]
		});
	}

	function displayNotification(title, message, idx) {
		if (!window.Notification) {
			alert(title + ': ' + message);
		}
		else if (Notification.permission === 'granted') {
			$(new Notification(title, { body: message })).click(function () {
				window.location.href = bestest_timer.timelog_idx.replace('XXX', idx);
			});
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
	});

	loadState();

	$('#quick-search').append(button);
});

