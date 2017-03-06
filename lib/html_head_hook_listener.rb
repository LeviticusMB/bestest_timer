class HtmlHeadHookListener < Redmine::Hook::ViewListener
  render_on :view_layouts_base_html_head, :partial => "bestest_timer/bestest_timer_partial"
end
