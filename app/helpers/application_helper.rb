module ApplicationHelper
  def add_script(src)
    @scripts ||= []
    @scripts << src
  end
  
  def more_scripts
    @scripts ||= []
    @scripts.map{|s| "<script src='#{s}'></script>" }.join("\n").html_safe
  end
end
