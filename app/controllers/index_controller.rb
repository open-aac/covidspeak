class IndexController < ApplicationController
  def index
  end

  def room
    render :layout => 'minimal'
  end
end
