from gi.repository import Notify
import gi
gi.require_version('Notify', '0.7')

Notify.init("Your App Name")
notification = Notify.Notification.new("Title", "Message body", "icon-name")
notification.show()
