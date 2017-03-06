
$(document).ready(function() {
    if (!window.bestest_timer) {
	return;
    }

    var cleanState = {
	started:    null,
	descr:      null,
	project:    null,
	issue:      null,
	activity:   null,
	comment:    null,
	activities: null,
    };

    var state  = JSON.parse(localStorage.getItem('bestest_timer/' + bestest_timer.user_id) || JSON.stringify(cleanState));
    var button = $('<button class="bestest_timer_button"></button>');
    var dialog = null;

    function updateUI() {
	button.text(state.started ? 'Recording' : 'Start Timer')
	    .attr('title', 
		  state.started ? 'Logging to ' + state.descr + ' since ' + toTime(new Date(state.started)) : null);
    }

    function clearState() {
	state = JSON.parse(JSON.stringify(cleanState));
	saveState();
    }

    function saveState() {
	localStorage.setItem('bestest_timer/' + bestest_timer.user_id, JSON.stringify(state));
	updateUI();
    }

    function toTime(date) {
        return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: 'numeric' });
    }

    function start() {
	if (!bestest_timer.api_key) {
	    alert('Please create an API access key on the "My account" page first.');
	}
	else if (!bestest_timer.project && !bestest_timer.issue) {
	    alert('Neither project nor issue could be inferred from current page.');
	}
	else {
	    state.started    = Date.now();
	    state.descr      = bestest_timer.project.name + (bestest_timer.issue ? ', issue #' + bestest_timer.issue.id : '');
	    state.project    = bestest_timer.project.id;
	    state.issue      = bestest_timer.issue && bestest_timer.issue.id;
	    state.activity   = (bestest_timer.activities.filter(function(activity) { return activity.is_default; })[0] || { id: null }).id;
	    state.activities = bestest_timer.activities;
	    saveState();
	}
    }

    function commit() {
	var stopped = new Date();
	var comment = ((state.comment || '') + ' [' + toTime(new Date(state.started)) + '-' + toTime(stopped) + ']').trim();

	$.ajax(bestest_timer.timelog_url, {
	    method: 'POST',
	    data:   JSON.stringify({
		time_entry: {
		    project_id:  state.project,
		    issue_id:    state.issue,
		    activity_id: state.activity,
		    hours:       (stopped - state.started) / 1000 / 60 / 60,
		    comments:    comment,
		}
	    }),
	    contentType: 'application/json',
	    headers: {
		'X-Redmine-API-Key': bestest_timer.api_key,
	    },
	})
	.done(function(response) {
	    var te = response.time_entry;
	    displayNotification('Logged ' + te.hours + ' hours to ' + te.project.name
				+ (te.issue ? ', issue #' + te.issue.id : '')
				+ ' (' + te.comments + ').');
	    clearState();
	})
	.fail(function($xhr) {
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
	    .change(function() {
		state.activity = Number(this.value);
	    });

	if (!state.activity) {
	    $('<option/>').appendTo(select);
	}

	state.activities.forEach(function(activity) {
	    $('<option/>', { value: activity.id, selected: activity.id === state.activity }).text(activity.name).appendTo(select);
	});

	[
	    $('<label for="bestest_timer_activity">Activity</label>'),
	    select,
	    $('<label for="bestest_timer_comment">Comment</label>'),
	    $('<input id="bestest_timer_comment" type="text" size="50" autocomplete="off" />').attr('value', state.comment)
		.change(function() {
		    state.comment = this.value;
		}),
	].forEach(function(elem) {
	    fieldset.append(elem);
	});

	dialog = form.dialog({
	    dialogClass: 'bestest_timer_dialog',
	    position:    { my: 'right top', at: 'right bottom', of: button },
	    width:       400,
	    draggable:   false,
	    modal:       true,
	    hide:        200,
	    show:        200,
	    title:       bestest_timer.plugin.name,

	    buttons: [
		{
		    text: 'Commit', icons: { primary: 'ui-icon-clock' }, click: function() {
			commit();
			$(this).dialog('close');
		    }
		},
		{
		    text: 'Discard', icons: { primary: 'ui-icon-trash' }, click: function() {
			discard();
			$(this).dialog('close');
		    }
		},
		{
		    text: 'Close', icons: { primary: 'ui-icon-close' }, click: function() {
			saveState();
			$(this).dialog('close');
		    }
		},
	    ]
	});
    }

    function displayNotification(message) {
	if (!window.Notification) {
	    alert(message);
	}
	else if (Notification.permission === "granted") {
	    new Notification(message);
	}
	else if (Notification.permission !== "denied") {
	    Notification.requestPermission(function (permission) {
		if (permission === "granted") {
		    displayNotification(message);
		}
	    });
	}
    }

    button.click(function() {
	if (!state.started) {
	    start();
	}
	else {
	    openDialog();
	}
    });

    updateUI();
    
    $('#quick-search').append(button);
});
