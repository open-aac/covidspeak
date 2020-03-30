Rails.application.routes.draw do
  # For details on the DSL available within this file, see http://guides.rubyonrails.org/routing.html
  root 'index#index' 
  get '/rooms/:room_id' => 'index#room'

  scope 'api/v1', module: 'api' do
    resources :rooms
    resources :users
  end
end
