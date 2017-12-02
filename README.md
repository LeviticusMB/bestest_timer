# Bestest Punch Clock for Redmine

This is a really simple timer/punch clock plugin for Redmine, inspired by the Firefox Add-on [Redmine Timer](https://addons.mozilla.org/en-US/firefox/addon/redmine-timer/).

It adds a single button to Redmine that starts logging time to the current issue or project. Click it again to select activity, add a comment, commit or abort.

And that's all there is to it.

![Bestest Punch Clock screenshot](README.1.png)

# Installation

`cd` into the `redmine/plugins` folder and run:
```bash
  git clone https://github.com/LeviticusMB/bestest_timer.git
```

# Upgrade to latest stable release

`cd` into the `redmine/plugins` folder and run:
```bash
  git pull
```

# Branches/major releases

## `master`

The `master` branch tracks the latest stable release.

## `v1.2` (2017-12-02)

The "Oops, I forgot" release.

* Reminders! *Bestest Punch Clock* will now remind you to punch in or punch out.
* Editable punch in/punch out time. Fix your mistakes before you punch out. [PR from kybersoft]
* On Redmine's *Edit Spent Time* page, synchronize the *Hours* field with the time information from the *Comment* field. Edit one and the other will automatically update.
* Disable *Bestest Punch Clock* button if we know punch if won't work. Provide help in tool tip.

## `v1.1` (2017-06-02)

Small UI improvments.

* Link to current project and issue.
* Use radio buttons for activity instead of a dropdown menu.
* Added a hack to remove black line in Safari.
* Disabled Punch out button if no activity has been selected.

## `v1.0` (2017-03-08)

Initial release branch.
