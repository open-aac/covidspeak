class IndexController < ApplicationController
  def index
    @show_intro = true;
  end

  def room
    render :layout => 'minimal'
  end

  def join
  end
end
