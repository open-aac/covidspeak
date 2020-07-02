class IndexController < ApplicationController
  def index
    @show_intro = true;
  end

  def room
    render :layout => 'minimal'
  end

  def join
  end

  def bundle
    @bundle_code = params['code']
    @bundle = Bundle.find_by_code(params['code'])
  end

  def admin
  end
end
